import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import nodemailer from "nodemailer";
import { fail, now, localDate, assertAvailable } from "./domain.js";
import { transaction } from "./db.js";
const positive = z.number().int().positive(),
  money = z.number().int().min(0);
const digest = (t) => createHash("sha256").update(t).digest("hex");
export function extensions(app, db, ctx, phase) {
  if (phase === "public") {
    app.post("/auth/forgot", ctx.authLimit, async (req, res) => {
      const b = z.object({ email: z.email() }).parse(req.body);
      if (!process.env.SMTP_HOST)
        fail(
          "Recuperação por e-mail não configurada. Entre em contato com o salão.",
          503,
        );
      const user = db
        .prepare("SELECT * FROM users WHERE email=?")
        .get(b.email.toLowerCase());
      if (user) {
        const token = randomBytes(32).toString("hex");
        db.prepare("DELETE FROM password_resets WHERE user_id=?").run(user.id);
        db.prepare("INSERT INTO password_resets VALUES(?,?,?)").run(
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
    app.post("/auth/reset", ctx.authLimit, (req, res) => {
      const b = z
        .object({
          token: z.string().length(64),
          password: z.string().min(10).max(128),
        })
        .parse(req.body);
      transaction(db, () => {
        const row = db
          .prepare("SELECT * FROM password_resets WHERE token=? AND expires>?")
          .get(digest(b.token), now());
        if (!row) fail("Código inválido ou expirado");
        db.prepare("UPDATE users SET password=? WHERE id=?").run(
          ctx.hash(b.password),
          row.user_id,
        );
        db.prepare("DELETE FROM password_resets WHERE user_id=?").run(
          row.user_id,
        );
      });
      res.json({ message: "Senha alterada. Entre com sua nova senha." });
    });
    return;
  }
  const { admin, own, audit } = ctx;
  app.post("/push/device", (req, res) => {
    const b = z
      .object({
        token: z.string().regex(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/),
        enabled: z.boolean().default(true),
      })
      .parse(req.body);
    db.prepare(
      "INSERT INTO push_devices(token,user_id,enabled) VALUES(?,?,?) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,enabled=excluded.enabled",
    ).run(b.token, req.user.id, b.enabled ? 1 : 0);
    res.json({ success: true });
  });
  app.delete("/push/device", (req, res) => {
    db.prepare("DELETE FROM push_devices WHERE user_id=?").run(req.user.id);
    res.status(204).end();
  });
  app.get("/monthly-reports", admin, (_, res) =>
    res.json(
      db
        .prepare(
          "SELECT month,created_at FROM monthly_reports ORDER BY month DESC",
        )
        .all(),
    ),
  );
  app.get("/monthly-reports/:month", admin, (req, res) => {
    const row = db
      .prepare("SELECT data FROM monthly_reports WHERE month=?")
      .get(req.params.month);
    if (!row) fail("Relatório não encontrado", 404);
    res.json(JSON.parse(row.data));
  });
  app.get("/products", admin, (_, res) =>
    res.json(db.prepare("SELECT * FROM products ORDER BY name").all()),
  );
  const productSchema = z.object({
    name: z.string().trim().min(2).max(100),
    price: money,
    stock: money,
    minimum: money.default(3),
    active: z.number().int().min(0).max(1).default(1),
  });
  app.post("/products", admin, (req, res) => {
    const b = productSchema.parse(req.body);
    const id = Number(
      db
        .prepare(
          "INSERT INTO products(name,price,stock,minimum,active) VALUES(?,?,?,?,?)",
        )
        .run(b.name, b.price, b.stock, b.minimum, b.active).lastInsertRowid,
    );
    res.status(201).json({ id, ...b });
  });
  app.put("/products/:id", admin, (req, res) => {
    const b = productSchema.parse(req.body);
    if (
      !db
        .prepare(
          "UPDATE products SET name=?,price=?,stock=?,minimum=?,active=? WHERE id=?",
        )
        .run(
          b.name,
          b.price,
          b.stock,
          b.minimum,
          b.active,
          Number(req.params.id),
        ).changes
    )
      fail("Produto não encontrado", 404);
    audit(req.user, "produto_alterado", Number(req.params.id));
    res.json(b);
  });
  app.get("/appointments/:id/order", admin, (req, res) => {
    const a = own(req);
    res.json({
      appointment: a,
      items: db
        .prepare("SELECT * FROM appointment_items WHERE appointment_id=?")
        .all(a.id),
      adjustment: db
        .prepare("SELECT * FROM order_adjustments WHERE appointment_id=?")
        .get(a.id),
      payments: db
        .prepare("SELECT * FROM payments WHERE appointment_id=?")
        .all(a.id),
    });
  });
  function editable(a) {
    if (
      !["confirmado", "em_atendimento", "aguardando_confirmacao"].includes(
        a.status,
      )
    )
      fail("Comanda não pode ser alterada neste status");
  }
  function total(id) {
    const gross = db
      .prepare(
        "SELECT COALESCE(SUM(quantity*unit_price),0) total FROM appointment_items WHERE appointment_id=?",
      )
      .get(id).total;
    const adj = db
      .prepare("SELECT * FROM order_adjustments WHERE appointment_id=?")
      .get(id);
    const price = gross - (adj?.discount || 0) + (adj?.extra || 0);
    const paid =
      db
        .prepare(
          "SELECT COALESCE(SUM(amount),0) total FROM payments WHERE appointment_id=?",
        )
        .get(id).total -
      db
        .prepare(
          "SELECT COALESCE(SUM(r.amount),0) total FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=?",
        )
        .get(id).total;
    if (price < 0 || price < paid)
      fail("Total inferior ao valor pago: revise descontos ou faça estorno");
    db.prepare("UPDATE appointments SET price=? WHERE id=?").run(price, id);
  }
  app.post("/appointments/:id/order/items", admin, (req, res) => {
    const b = z
      .object({
        kind: z.enum(["produto", "servico"]),
        item_id: positive,
        quantity: positive.max(100).default(1),
      })
      .parse(req.body);
    transaction(db, () => {
      const a = own(req);
      editable(a);
      if (b.kind === "produto") {
        const p = db
          .prepare("SELECT * FROM products WHERE id=? AND active=1")
          .get(b.item_id);
        if (!p || p.stock < b.quantity) fail("Estoque insuficiente");
        db.prepare("UPDATE products SET stock=stock-? WHERE id=?").run(
          b.quantity,
          p.id,
        );
        db.prepare(
          "INSERT INTO appointment_items(appointment_id,kind,name,quantity,unit_price,product_id) VALUES(?,'produto',?,?,?,?)",
        ).run(a.id, p.name, b.quantity, p.price, p.id);
      } else {
        const service = db
          .prepare("SELECT * FROM services WHERE id=? AND active=1")
          .get(b.item_id);
        if (
          !service ||
          !db
            .prepare(
              "SELECT 1 FROM skills WHERE service_id=? AND professional_id=?",
            )
            .get(service.id, a.professional_id)
        )
          fail("Serviço indisponível para esta profissional");
        const end = new Date(
          new Date(a.end).getTime() +
            (service.duration + service.buffer) * b.quantity * 60000,
        ).toISOString();
        const cfg = db.prepare("SELECT * FROM settings").get();
        const endHour = Number(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            hourCycle: "h23",
          }).format(new Date(end)),
        );
        if (localDate(end) !== localDate(a.start) || endHour >= cfg.close_hour)
          fail("Duração ultrapassa o funcionamento do salão");
        assertAvailable(db, a.professional_id, a.start, end, a.id);
        db.prepare("UPDATE appointments SET end=? WHERE id=?").run(end, a.id);
        db.prepare(
          "INSERT INTO appointment_items(appointment_id,kind,name,quantity,unit_price,commission) VALUES(?,'servico',?,?,?,?)",
        ).run(
          a.id,
          service.name,
          b.quantity,
          service.price,
          db
            .prepare("SELECT percent FROM commission_rules WHERE service_id=?")
            .get(service.id)?.percent || 0,
        );
      }
      total(a.id);
      audit(req.user, "item_comanda", a.id);
    });
    res.status(201).json({ success: true });
  });
  app.delete("/appointments/:id/order/items/:item", admin, (req, res) => {
    transaction(db, () => {
      const a = own(req);
      editable(a);
      const item = db
        .prepare(
          "SELECT * FROM appointment_items WHERE id=? AND appointment_id=? AND kind='produto'",
        )
        .get(Number(req.params.item), a.id);
      if (!item)
        fail("Somente produtos adicionais podem ser removidos nesta versão");
      db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(
        item.quantity,
        item.product_id,
      );
      db.prepare("DELETE FROM appointment_items WHERE id=?").run(item.id);
      total(a.id);
      audit(req.user, "item_removido", a.id);
    });
    res.json({ success: true });
  });
  app.put("/appointments/:id/order/adjustment", admin, (req, res) => {
    const b = z
      .object({
        discount: money,
        extra: money,
        reason: z.string().trim().min(3).max(200),
      })
      .parse(req.body);
    transaction(db, () => {
      const a = own(req);
      editable(a);
      db.prepare(
        "INSERT INTO order_adjustments(appointment_id,discount,extra,reason) VALUES(?,?,?,?) ON CONFLICT(appointment_id) DO UPDATE SET discount=excluded.discount,extra=excluded.extra,reason=excluded.reason",
      ).run(a.id, b.discount, b.extra, b.reason);
      total(a.id);
      audit(req.user, "ajuste_comanda", a.id);
    });
    res.json({ success: true });
  });
  app.post("/refunds", admin, (req, res) => {
    const b = z
      .object({
        payment_id: positive,
        amount: positive,
        reason: z.string().min(3).max(200),
        request_key: z.string().min(10).max(100),
      })
      .parse(req.body);
    transaction(db, () => {
      const existing = db
        .prepare("SELECT * FROM refunds WHERE request_key=?")
        .get(b.request_key);
      if (existing) {
        if (
          existing.payment_id !== b.payment_id ||
          existing.amount !== b.amount
        )
          fail("Chave já utilizada", 409);
        return;
      }
      const p = db
        .prepare("SELECT * FROM payments WHERE id=?")
        .get(b.payment_id);
      if (!p) fail("Pagamento não encontrado", 404);
      const refunded = db
        .prepare(
          "SELECT COALESCE(SUM(amount),0) total FROM refunds WHERE payment_id=?",
        )
        .get(p.id).total;
      if (refunded + b.amount > p.amount) fail("Estorno superior ao pagamento");
      if (
        p.method === "dinheiro" &&
        !db
          .prepare("SELECT 1 FROM cash_days WHERE date=? AND status='aberto'")
          .get(localDate())
      )
        fail("Abra o caixa antes de estornar dinheiro");
      const id = Number(
        db
          .prepare(
            "INSERT INTO refunds(payment_id,amount,reason,created_at,request_key) VALUES(?,?,?,?,?)",
          )
          .run(p.id, b.amount, b.reason, now(), b.request_key).lastInsertRowid,
      );
      audit(req.user, "estorno", id);
    });
    res.status(201).json({ success: true });
  });
  app.get("/commission-rules", admin, (_, res) =>
    res.json(db.prepare("SELECT * FROM commission_rules").all()),
  );
  app.put("/commission-rules/:id", admin, (req, res) => {
    const percent = z.number().int().min(0).max(100).parse(req.body.percent);
    if (
      !db
        .prepare("SELECT 1 FROM services WHERE id=?")
        .get(Number(req.params.id))
    )
      fail("Serviço não encontrado");
    db.prepare(
      "INSERT INTO commission_rules VALUES(?,?) ON CONFLICT(service_id) DO UPDATE SET percent=excluded.percent",
    ).run(Number(req.params.id), percent);
    res.json({ success: true });
  });
  app.get("/commissions", admin, (_, res) =>
    res.json(
      db
        .prepare(
          "SELECT c.*,p.name professional,a.start FROM commissions c JOIN professionals p ON p.id=c.professional_id JOIN appointments a ON a.id=c.appointment_id ORDER BY a.start DESC",
        )
        .all(),
    ),
  );
  app.post("/commissions/:id/pay", admin, (req, res) => {
    const method = z
      .enum(["pix", "dinheiro", "debito", "credito"])
      .parse(req.body.method);
    transaction(db, () => {
      const c = db
        .prepare("SELECT * FROM commissions WHERE appointment_id=?")
        .get(Number(req.params.id));
      if (!c || c.paid_at || c.amount <= 0) fail("Comissão não disponível");
      if (
        method === "dinheiro" &&
        !db
          .prepare("SELECT 1 FROM cash_days WHERE date=? AND status='aberto'")
          .get(localDate())
      )
        fail("Abra o caixa");
      const expense = Number(
        db
          .prepare(
            "INSERT INTO expenses(description,amount,method,date) VALUES(?,?,?,?)",
          )
          .run(
            "Comissão atendimento #" + c.appointment_id,
            c.amount,
            method,
            localDate(),
          ).lastInsertRowid,
      );
      db.prepare(
        "UPDATE commissions SET paid_at=?,expense_id=? WHERE appointment_id=? AND paid_at IS NULL",
      ).run(now(), expense, c.appointment_id);
      audit(req.user, "comissao_paga", c.appointment_id);
    });
    res.json({ success: true });
  });
  app.get("/waitlist", (req, res) => {
    const sql =
      req.user.role === "admin"
        ? "SELECT w.*,u.name client FROM waitlist w JOIN users u ON u.id=w.user_id ORDER BY date"
        : "SELECT * FROM waitlist WHERE user_id=? ORDER BY date";
    res.json(
      db.prepare(sql).all(...(req.user.role === "admin" ? [] : [req.user.id])),
    );
  });
  app.post("/waitlist", (req, res) => {
    const b = z
      .object({
        service_id: positive,
        professional_id: positive,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(req.body);
    if (b.date < localDate()) fail("Escolha uma data futura");
    if (
      !db
        .prepare(
          "SELECT 1 FROM skills WHERE service_id=? AND professional_id=?",
        )
        .get(b.service_id, b.professional_id)
    )
      fail("Serviço ou profissional inválido");
    if (
      db
        .prepare(
          "SELECT 1 FROM waitlist WHERE user_id=? AND service_id=? AND professional_id=? AND date=? AND status='aguardando'",
        )
        .get(req.user.id, b.service_id, b.professional_id, b.date)
    )
      fail("Você já está na lista de espera");
    const id = Number(
      db
        .prepare(
          "INSERT INTO waitlist(user_id,service_id,professional_id,date) VALUES(?,?,?,?)",
        )
        .run(req.user.id, b.service_id, b.professional_id, b.date)
        .lastInsertRowid,
    );
    res.status(201).json({ id, ...b });
  });
}
