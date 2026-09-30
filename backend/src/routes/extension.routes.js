import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import nodemailer from "nodemailer";
import { fail, now, localDate, assertAvailable } from "../domain.js";
import { transaction } from "../db.js";

const positive = z.number().int().positive();
const money = z.number().int().min(0);
const digest = (value) => createHash("sha256").update(value).digest("hex");

export function registerPublicExtensionRoutes(app, db, context) {
  const { queries } = context;
  app.post("/auth/forgot", context.authLimit, async (req, res) => {
    const input = z.object({ email: z.email() }).parse(req.body);
    if (!process.env.SMTP_HOST)
      fail(
        "Recuperação por e-mail não configurada. Entre em contato com o salão.",
        503,
      );
    const user = await queries.findUserByEmail(input.email.toLowerCase());
    if (user) {
      const token = randomBytes(32).toString("hex");
      await queries.deletePasswordResetsForUser(user.id);
      await queries.createPasswordReset(
        digest(token),
        user.id,
        new Date(Date.now() + 30 * 60000).toISOString(),
      );
      const smtp = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_PORT === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
      await smtp.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: "Recuperação de senha · Espaço Josiane Marine",
        text: `Seu código de recuperação (válido por 30 minutos): ${token}\nAbra o app, selecione Recuperar senha e informe este código.`,
      });
    }
    res.json({
      message:
        "Se o e-mail estiver cadastrado, você receberá um código de recuperação.",
    });
  });

  app.post("/auth/reset", context.authLimit, async (req, res) => {
    const input = z
      .object({
        token: z.string().length(64),
        password: z.string().min(10).max(128),
      })
      .parse(req.body);
    await transaction(db, async () => {
      const row = await queries.findValidPasswordReset(digest(input.token), now());
      if (!row) fail("Código inválido ou expirado");
      await queries.updateUserPassword(context.hash(input.password), row.user_id);
      await queries.deletePasswordResetsForUser(row.user_id);
    });
    res.json({ message: "Senha alterada. Entre com sua nova senha." });
  });
}

export function registerPrivateExtensionRoutes(app, db, context) {
  const { admin, own, audit } = context;
  const { queries } = context;
  app.post("/push/device", async (req, res) => {
    const input = z
      .object({
        token: z.string().regex(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/),
        enabled: z.boolean().default(true),
      })
      .parse(req.body);
    await queries.upsertPushDevice(input.token, req.user.id, input.enabled ? 1 : 0);
    res.json({ success: true });
  });
  app.delete("/push/device", async (req, res) => {
    await queries.deletePushDevicesForUser(req.user.id);
    res.status(204).end();
  });
  app.get("/monthly-reports", admin, async (_, res) =>
    res.json(
      await queries.listMonthlyReports(),
    ),
  );
  app.get("/monthly-reports/:month", admin, async (req, res) => {
    const row = await queries.findMonthlyReport(req.params.month);
    if (!row) fail("Relatório não encontrado", 404);
    res.json(JSON.parse(row.data));
  });
  app.get("/products", admin, async (_, res) =>
    res.json(await queries.listProducts()),
  );
  const productSchema = z.object({
    name: z.string().trim().min(2).max(100),
    price: money,
    stock: money,
    minimum: money.default(3),
    active: z.number().int().min(0).max(1).default(1),
  });
  app.post("/products", admin, async (req, res) => {
    const input = productSchema.parse(req.body);
    const id = Number((await queries.createProduct(input)).lastInsertRowid);
    res.status(201).json({ id, ...input });
  });
  app.put("/products/:id", admin, async (req, res) => {
    const input = productSchema.parse(req.body);
    const id = Number(req.params.id);
    const result = await queries.updateProduct(input, id);
    if (!result.changes) fail("Produto não encontrado", 404);
    await audit(req.user, "produto_alterado", id);
    res.json(input);
  });
  app.get("/appointments/:id/order", admin, async (req, res) => {
    const appointment = await own(req);
    res.json({
      appointment,
      items: await queries.listOrderItems(appointment.id),
      adjustment: await queries.findOrderAdjustment(appointment.id),
      payments: await queries.listAppointmentPayments(appointment.id),
    });
  });
  function assertEditable(appointment) {
    if (
      !["confirmado", "em_atendimento", "aguardando_confirmacao"].includes(
        appointment.status,
      )
    )
      fail("Comanda não pode ser alterada neste status");
  }
  async function updateOrderTotal(appointmentId) {
    const gross = (await queries.orderGross(appointmentId)).total;
    const adjustment = await queries.findOrderAdjustment(appointmentId);
    const price = gross - (adjustment?.discount || 0) + (adjustment?.extra || 0);
    const paid =
      (await queries.paidTotal(appointmentId)).total -
      (await queries.refundedTotalForAppointment(appointmentId)).total;
    if (price < 0 || price < paid)
      fail("Total inferior ao valor pago: revise descontos ou faça estorno");
    await queries.updateAppointmentPrice(price, appointmentId);
  }

  app.post("/appointments/:id/order/items", admin, async (req, res) => {
    const input = z
      .object({
        kind: z.enum(["produto", "servico"]),
        item_id: positive,
        quantity: positive.max(100).default(1),
      })
      .parse(req.body);
    await transaction(db, async () => {
      const appointment = await own(req);
      assertEditable(appointment);
      if (input.kind === "produto") {
        const product = await queries.findActiveProduct(input.item_id);
        if (!product || product.stock < input.quantity)
          fail("Estoque insuficiente");
        await queries.changeProductStock(-input.quantity, product.id);
        await queries.insertProductOrderItem(
          appointment.id,
          product.name,
          input.quantity,
          product.price,
          product.id,
        );
      } else {
        const service = await queries.findActiveService(input.item_id);
        if (
          !service ||
          !(await queries.serviceSkillExists(service.id, appointment.professional_id))
        )
          fail("Serviço indisponível para esta profissional");
        const end = new Date(
          new Date(appointment.end).getTime() +
            (service.duration + service.buffer) * input.quantity * 60000,
        ).toISOString();
        const settings = await queries.getSettings();
        const endHour = Number(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            hourCycle: "h23",
          }).format(new Date(end)),
        );
        if (localDate(end) !== localDate(appointment.start) || endHour >= settings.close_hour)
          fail("Duração ultrapassa o funcionamento do salão");
        await assertAvailable(
          db,
          appointment.professional_id,
          appointment.start,
          end,
          appointment.id,
        );
        await queries.updateAppointmentEnd(end, appointment.id);
        await queries.insertServiceOrderItem(
          appointment.id,
          service.name,
          input.quantity,
          service.price,
          (await queries.commissionPercent(service.id))?.percent || 0,
        );
      }
      await updateOrderTotal(appointment.id);
      await audit(req.user, "item_comanda", appointment.id);
    });
    res.status(201).json({ success: true });
  });
  app.delete("/appointments/:id/order/items/:item", admin, async (req, res) => {
    await transaction(db, async () => {
      const appointment = await own(req);
      assertEditable(appointment);
      const item = await queries.findRemovableProductItem(Number(req.params.item), appointment.id);
      if (!item)
        fail("Somente produtos adicionais podem ser removidos nesta versão");
      await queries.changeProductStock(item.quantity, item.product_id);
      await queries.deleteOrderItem(item.id);
      await updateOrderTotal(appointment.id);
      await audit(req.user, "item_removido", appointment.id);
    });
    res.json({ success: true });
  });
  app.put("/appointments/:id/order/adjustment", admin, async (req, res) => {
    const input = z
      .object({
        discount: money,
        extra: money,
        reason: z.string().trim().min(3).max(200),
      })
      .parse(req.body);
    await transaction(db, async () => {
      const appointment = await own(req);
      assertEditable(appointment);
      await queries.upsertOrderAdjustment(appointment.id, input.discount, input.extra, input.reason);
      await updateOrderTotal(appointment.id);
      await audit(req.user, "ajuste_comanda", appointment.id);
    });
    res.json({ success: true });
  });
  app.post("/refunds", admin, async (req, res) => {
    const input = z
      .object({
        payment_id: positive,
        amount: positive,
        reason: z.string().min(3).max(200),
        request_key: z.string().min(10).max(100),
      })
      .parse(req.body);
    await transaction(db, async () => {
      const existing = await queries.findRefundByRequestKey(input.request_key);
      if (existing) {
        if (
          existing.payment_id !== input.payment_id ||
          existing.amount !== input.amount
        )
          fail("Chave já utilizada", 409);
        return;
      }
      const payment = await queries.findPayment(input.payment_id);
      if (!payment) fail("Pagamento não encontrado", 404);
      const refunded = (await queries.refundedTotalForPayment(payment.id)).total;
      if (refunded + input.amount > payment.amount)
        fail("Estorno superior ao pagamento");
      if (
        payment.method === "dinheiro" &&
        !(await queries.isCashOpen(localDate()))
      )
        fail("Abra o caixa antes de estornar dinheiro");
      const id = Number((await queries.createRefund(payment.id, input.amount, input.reason, now(), input.request_key)).lastInsertRowid);
      await audit(req.user, "estorno", id);
    });
    res.status(201).json({ success: true });
  });
  app.get("/commission-rules", admin, async (_, res) =>
    res.json(await queries.listCommissionRules()),
  );
  app.put("/commission-rules/:id", admin, async (req, res) => {
    const percent = z.number().int().min(0).max(100).parse(req.body.percent);
    const serviceId = Number(req.params.id);
    if (!(await queries.serviceExists(serviceId)))
      fail("Serviço não encontrado");
    await queries.upsertCommissionRule(serviceId, percent);
    res.json({ success: true });
  });
  app.get("/commissions", admin, async (_, res) =>
    res.json(
      await queries.listCommissions(),
    ),
  );
  app.post("/commissions/:id/pay", admin, async (req, res) => {
    const method = z
      .enum(["pix", "dinheiro", "debito", "credito"])
      .parse(req.body.method);
    await transaction(db, async () => {
      const commission = await queries.findCommission(Number(req.params.id));
      if (!commission || commission.paid_at || commission.amount <= 0)
        fail("Comissão não disponível");
      if (
        method === "dinheiro" &&
        !(await queries.isCashOpen(localDate()))
      )
        fail("Abra o caixa");
      const expenseId = Number((await queries.createExpense({
        description: "Comissão atendimento #" + commission.appointment_id,
        amount: commission.amount,
        method,
        date: localDate(),
      })).lastInsertRowid);
      await queries.markCommissionPaid(now(), expenseId, commission.appointment_id);
      await audit(req.user, "comissao_paga", commission.appointment_id);
    });
    res.json({ success: true });
  });
  app.get("/waitlist", async (req, res) => {
    res.json(await queries.listWaitlist(req.user.role === "admin" ? null : req.user.id));
  });
  app.post("/waitlist", async (req, res) => {
    const input = z
      .object({
        service_id: positive,
        professional_id: positive,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(req.body);
    if (input.date < localDate()) fail("Escolha uma data futura");
    if (
      !(await queries.serviceSkillExists(input.service_id, input.professional_id))
    )
      fail("Serviço ou profissional inválido");
    if (
      await queries.findActiveWaitlistEntry(req.user.id, input.service_id, input.professional_id, input.date)
    )
      fail("Você já está na lista de espera");
    const id = Number((await queries.createWaitlistEntry(req.user.id, input.service_id, input.professional_id, input.date)).lastInsertRowid);
    res.status(201).json({ id, ...input });
  });
}
