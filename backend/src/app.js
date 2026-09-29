import { enqueue } from "./jobs.js";
import { createHash } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { extensions } from "./extensions.js";
import { hash, verify } from "./auth.js";
import { transaction } from "./db.js";
import {
  fail,
  now,
  windowFor,
  assertAvailable,
  report,
  localDate,
  closeDue,
} from "./domain.js";
const integer = z.number().int().positive();
const money = z.number().int().min(0);
const methods = z.enum(["dinheiro", "pix", "debito", "credito"]);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Data inválida",
  );
export function createApp(db, secret) {
  if (!secret || secret.length < 32)
    throw Error("Defina JWT_SECRET com pelo menos 32 caracteres");
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || false }));
  app.use(express.json({ limit: "100kb" }));
  app.use(rateLimit({ windowMs: 60000, limit: 180 }));
  const authLimit = rateLimit({ windowMs: 15 * 60000, limit: 30 });
  const audit = (u, action, id) =>
    db
      .prepare(
        "INSERT INTO audit(user_id,action,entity_id,created_at) VALUES(?,?,?,?)",
      )
      .run(u.id, action, id || null, now());
  const notify = (u, title) => enqueue(db, u, title);
  const session = (u) => ({
    token: jwt.sign(
      {
        sub: String(u.id),
        version: createHash("sha256").update(u.password).digest("hex"),
      },
      secret,
      { expiresIn: "12h" },
    ),
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
    },
  });
  app.get("/health", (_, res) => res.json({ status: "ok" }));
  app.post("/auth/register", authLimit, (req, res) => {
    const b = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().transform((v) => v.toLowerCase()),
        phone: z.string().max(30).default(""),
        password: z.string().min(10).max(128),
      })
      .parse(req.body);
    if (db.prepare("SELECT 1 FROM users WHERE email=?").get(b.email))
      fail("E-mail já cadastrado", 409);
    const id = Number(
      db
        .prepare("INSERT INTO users(name,email,phone,password) VALUES(?,?,?,?)")
        .run(b.name, b.email, b.phone, hash(b.password)).lastInsertRowid,
    );
    res
      .status(201)
      .json(session(db.prepare("SELECT * FROM users WHERE id=?").get(id)));
  });
  app.post("/auth/login", authLimit, (req, res) => {
    const b = z
      .object({ email: z.email(), password: z.string().max(128) })
      .parse(req.body);
    const u = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(b.email.toLowerCase());
    if (!u || !verify(b.password, u.password))
      fail("E-mail ou senha inválidos", 401);
    res.json(session(u));
  });
  extensions(app, db, { authLimit, session, hash, audit, notify }, "public");
  app.use((req, res, next) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      const p = jwt.verify(token || "", secret);
      const user = db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(Number(p.sub));
      if (
        !user ||
        p.version !== createHash("sha256").update(user.password).digest("hex")
      )
        fail("Sessão inválida", 401);
      const { password, ...safe } = user;
      req.user = safe;
      if (!req.user) fail("Sessão inválida", 401);
      next();
    } catch {
      res.status(401).json({ message: "Entre novamente para continuar" });
    }
  });
  app.use((req, res, next) => {
    try {
      closeDue(db);
      next();
    } catch (e) {
      next(e);
    }
  });
  const admin = (req, res, next) =>
    req.user.role === "admin"
      ? next()
      : res.status(403).json({ message: "Acesso exclusivo do administrador" });
  app.get("/me", (req, res) => res.json(req.user));
  app.put("/me", (req, res) => {
    const b = z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: z.string().max(30),
      })
      .parse(req.body);
    db.prepare("UPDATE users SET name=?,phone=? WHERE id=?").run(
      b.name,
      b.phone,
      req.user.id,
    );
    res.json({ ...req.user, ...b });
  });
  app.get("/notifications", (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50",
        )
        .all(req.user.id),
    ),
  );
  app.get("/services", (req, res) =>
    res.json(
      db
        .prepare(
          `SELECT * FROM services ${req.user.role === "admin" ? "" : "WHERE active=1"} ORDER BY name`,
        )
        .all(),
    ),
  );
  const serviceSchema = z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().max(500).default(""),
    price: money,
    duration: integer.max(600),
    buffer: money.max(120).default(0),
    active: z.number().int().min(0).max(1).default(1),
  });
  app.post("/services", admin, (req, res) => {
    const b = serviceSchema.parse(req.body);
    const id = Number(
      db
        .prepare(
          "INSERT INTO services(name,description,price,duration,buffer,active) VALUES(?,?,?,?,?,?)",
        )
        .run(b.name, b.description, b.price, b.duration, b.buffer, b.active)
        .lastInsertRowid,
    );
    audit(req.user, "servico_criado", id);
    res.status(201).json({ id, ...b });
  });
  app.put("/services/:id", admin, (req, res) => {
    const b = serviceSchema.parse(req.body);
    const result = db
      .prepare(
        "UPDATE services SET name=?,description=?,price=?,duration=?,buffer=?,active=? WHERE id=?",
      )
      .run(
        b.name,
        b.description,
        b.price,
        b.duration,
        b.buffer,
        b.active,
        Number(req.params.id),
      );
    if (!result.changes) fail("Serviço não encontrado", 404);
    audit(req.user, "servico_alterado", Number(req.params.id));
    res.json({ id: Number(req.params.id), ...b });
  });
  app.get("/professionals", (req, res) => {
    const rows = db
      .prepare(
        `SELECT * FROM professionals ${req.user.role === "admin" ? "" : "WHERE active=1"} ORDER BY name`,
      )
      .all();
    res.json(
      rows.map((p) => ({
        ...p,
        service_ids: db
          .prepare("SELECT service_id FROM skills WHERE professional_id=?")
          .all(p.id)
          .map((s) => s.service_id),
      })),
    );
  });
  const professionalSchema = z.object({
    name: z.string().trim().min(2).max(100),
    active: z.number().int().min(0).max(1).default(1),
    service_ids: z.array(integer).min(1),
  });
  function saveProfessional(b, id) {
    return transaction(db, () => {
      for (const s of b.service_ids)
        if (!db.prepare("SELECT 1 FROM services WHERE id=?").get(s))
          fail("Serviço inválido");
      if (id) {
        if (
          !db
            .prepare("UPDATE professionals SET name=?,active=? WHERE id=?")
            .run(b.name, b.active, id).changes
        )
          fail("Profissional não encontrado", 404);
        db.prepare("DELETE FROM skills WHERE professional_id=?").run(id);
      } else
        id = Number(
          db
            .prepare("INSERT INTO professionals(name,active) VALUES(?,?)")
            .run(b.name, b.active).lastInsertRowid,
        );
      for (const s of new Set(b.service_ids))
        db.prepare("INSERT INTO skills VALUES(?,?)").run(id, s);
      return { id, ...b };
    });
  }
  app.post("/professionals", admin, (req, res) =>
    res.status(201).json(saveProfessional(professionalSchema.parse(req.body))),
  );
  app.put("/professionals/:id", admin, (req, res) =>
    res.json(
      saveProfessional(
        professionalSchema.parse(req.body),
        Number(req.params.id),
      ),
    ),
  );
  app.get("/settings", admin, (_, res) => {
    const s = db.prepare("SELECT * FROM settings").get();
    res.json({ ...s, days: JSON.parse(s.days) });
  });
  app.put("/settings", admin, (req, res) => {
    const b = z
      .object({
        open_hour: z.number().int().min(0).max(23),
        close_hour: z.number().int().min(1).max(24),
        close_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        days: z.array(z.number().int().min(0).max(6)).min(1),
        cancel_hours: money.max(168),
      })
      .refine((b) => b.close_hour > b.open_hour)
      .parse(req.body);
    db.prepare(
      "UPDATE settings SET open_hour=?,close_hour=?,close_time=?,days=?,cancel_hours=?",
    ).run(
      b.open_hour,
      b.close_hour,
      b.close_time,
      JSON.stringify(b.days),
      b.cancel_hours,
    );
    audit(req.user, "configuracao_alterada");
    res.json(b);
  });
  app.get("/blocks", admin, (_, res) =>
    res.json(db.prepare("SELECT * FROM blocks ORDER BY start DESC").all()),
  );
  app.post("/blocks", admin, (req, res) => {
    const b = z
      .object({
        professional_id: integer.nullable(),
        start: z.iso.datetime({ offset: true }),
        end: z.iso.datetime({ offset: true }),
        reason: z.string().max(200),
      })
      .refine((b) => new Date(b.end) > new Date(b.start))
      .parse(req.body);
    const id = transaction(db, () => {
      const start = new Date(b.start).toISOString(),
        end = new Date(b.end).toISOString();
      const overlap = db
        .prepare(
          "SELECT 1 FROM appointments WHERE (? IS NULL OR professional_id=?) AND status NOT IN ('cancelado','nao_compareceu') AND start<? AND end>?",
        )
        .get(b.professional_id, b.professional_id, end, start);
      if (overlap)
        fail("Reagende os atendimentos deste período antes de bloquear", 409);
      return Number(
        db
          .prepare(
            "INSERT INTO blocks(professional_id,start,end,reason) VALUES(?,?,?,?)",
          )
          .run(b.professional_id, start, end, b.reason).lastInsertRowid,
      );
    });
    res.status(201).json({ id, ...b });
  });
  app.delete("/blocks/:id", admin, (req, res) => {
    db.prepare("DELETE FROM blocks WHERE id=?").run(Number(req.params.id));
    res.status(204).end();
  });
  app.get("/availability", (req, res) => {
    const b = z
      .object({
        service_id: z.coerce.number().int().positive(),
        professional_id: z.coerce.number().int().positive(),
        date,
      })
      .parse(req.query);
    const slots = [];
    for (let m = 0; m < 1440; m += 15) {
      const start = `${b.date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00-03:00`;
      try {
        const w = windowFor(db, b.service_id, b.professional_id, start);
        assertAvailable(db, b.professional_id, w.start, w.end);
        slots.push({ start: w.start, label: start.slice(11, 16) });
      } catch (e) {
        if (!e.status) throw e;
      }
    }
    res.json(slots);
  });
  app.get("/appointments", (req, res) => {
    let sql =
      "SELECT a.*,u.name client,p.name professional,COALESCE((SELECT SUM(amount) FROM payments WHERE appointment_id=a.id),0)-COALESCE((SELECT SUM(r.amount) FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=a.id),0) paid FROM appointments a JOIN users u ON u.id=a.user_id JOIN professionals p ON p.id=a.professional_id";
    const args = [];
    const filters = [];
    if (req.user.role !== "admin") {
      filters.push("a.user_id=?");
      args.push(req.user.id);
    }
    if (req.query.date) {
      const d = date.parse(req.query.date);
      filters.push("date(a.start,'-3 hours')=?");
      args.push(d);
    }
    if (filters.length) sql += " WHERE " + filters.join(" AND ");
    res.json(db.prepare(sql + " ORDER BY a.start DESC LIMIT 500").all(...args));
  });
  const booking = z.object({
    service_id: integer,
    professional_id: integer,
    start: z.iso.datetime({ offset: true }),
    notes: z.string().max(500).default(""),
    user_id: integer.optional(),
  });
  app.post("/appointments", (req, res) => {
    const b = booking.parse(req.body);
    const id = transaction(db, () => {
      const uid =
        req.user.role === "admin" ? b.user_id || req.user.id : req.user.id;
      if (!db.prepare("SELECT 1 FROM users WHERE id=?").get(uid))
        fail("Cliente inválido");
      const w = windowFor(db, b.service_id, b.professional_id, b.start);
      assertAvailable(db, b.professional_id, w.start, w.end);
      const id = Number(
        db
          .prepare(
            "INSERT INTO appointments(user_id,service_id,professional_id,start,end,price,service_name,notes) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            uid,
            b.service_id,
            b.professional_id,
            w.start,
            w.end,
            w.service.price,
            w.service.name,
            b.notes,
          ).lastInsertRowid,
      );
      audit(req.user, "agendamento_criado", id);
      db.prepare(
        "INSERT INTO appointment_items(appointment_id,kind,name,quantity,unit_price,commission) VALUES(?,'servico',?,1,?,?)",
      ).run(
        id,
        w.service.name,
        w.service.price,
        db
          .prepare("SELECT percent FROM commission_rules WHERE service_id=?")
          .get(b.service_id)?.percent || 0,
      );
      notify(uid, "Seu agendamento foi confirmado");
      return id;
    });
    res.status(201).json({ id });
  });
  function own(req) {
    const a = db
      .prepare("SELECT * FROM appointments WHERE id=?")
      .get(Number(req.params.id));
    if (!a) fail("Agendamento não encontrado", 404);
    if (req.user.role !== "admin" && a.user_id !== req.user.id)
      fail("Acesso negado", 403);
    return a;
  }
  function canChange(req, a) {
    if (!["confirmado", "aguardando_confirmacao"].includes(a.status))
      fail("Este agendamento não pode ser alterado");
    if (req.user.role !== "admin") {
      const cfg = db.prepare("SELECT * FROM settings").get();
      if (new Date(a.start) - new Date() < cfg.cancel_hours * 3600000)
        fail(`Alterações exigem antecedência de ${cfg.cancel_hours} horas`);
    }
  }
  app.patch("/appointments/:id/reschedule", (req, res) => {
    const b = z
      .object({ start: z.iso.datetime({ offset: true }) })
      .parse(req.body);
    transaction(db, () => {
      const a = own(req);
      canChange(req, a);
      const w = windowFor(db, a.service_id, a.professional_id, b.start);
      assertAvailable(db, a.professional_id, w.start, w.end, a.id);
      db.prepare("UPDATE appointments SET start=?,end=? WHERE id=?").run(
        w.start,
        w.end,
        a.id,
      );
      audit(req.user, "reagendamento", a.id);
      notify(a.user_id, "Seu agendamento foi reagendado");
    });
    res.json({ success: true });
  });
  app.patch("/appointments/:id/cancel", (req, res) => {
    transaction(db, () => {
      const a = own(req);
      canChange(req, a);
      const paid =
        db
          .prepare(
            "SELECT COALESCE(SUM(amount),0) total FROM payments WHERE appointment_id=?",
          )
          .get(a.id).total -
        db
          .prepare(
            "SELECT COALESCE(SUM(r.amount),0) total FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=?",
          )
          .get(a.id).total;
      if (paid > 0)
        fail("Agendamento com pagamento: contate o salão para estorno");
      for (const item of db
        .prepare(
          "SELECT * FROM appointment_items WHERE appointment_id=? AND kind='produto'",
        )
        .all(a.id))
        db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(
          item.quantity,
          item.product_id,
        );
      db.prepare(
        "DELETE FROM appointment_items WHERE appointment_id=? AND kind='produto'",
      ).run(a.id);
      db.prepare("UPDATE appointments SET status='cancelado' WHERE id=?").run(
        a.id,
      );
      audit(req.user, "cancelamento", a.id);
      notify(a.user_id, "Seu agendamento foi cancelado");
    });
    res.json({ success: true });
  });
  app.patch("/appointments/:id/status", admin, (req, res) => {
    const b = z
      .object({
        status: z.enum([
          "confirmado",
          "em_atendimento",
          "concluido",
          "nao_compareceu",
        ]),
      })
      .parse(req.body);
    const a = own(req);
    const transitions = {
      confirmado: ["em_atendimento", "nao_compareceu"],
      em_atendimento: ["concluido"],
      aguardando_confirmacao: ["confirmado"],
    };
    if (!transitions[a.status]?.includes(b.status))
      fail("Transição de status inválida");
    transaction(db, () => {
      db.prepare("UPDATE appointments SET status=? WHERE id=?").run(
        b.status,
        a.id,
      );
      if (b.status === "concluido") {
        const items = db
          .prepare(
            "SELECT * FROM appointment_items WHERE appointment_id=? AND kind='servico'",
          )
          .all(a.id);
        const adjustments = db
          .prepare("SELECT * FROM order_adjustments WHERE appointment_id=?")
          .get(a.id);
        const gross = db
          .prepare(
            "SELECT COALESCE(SUM(quantity*unit_price),0) total FROM appointment_items WHERE appointment_id=?",
          )
          .get(a.id).total;
        const net = BigInt(Math.max(0, gross - (adjustments?.discount || 0)));
        const denominator = BigInt(gross || 1) * 100n;
        const commission = items.reduce((n, i) => {
          const numerator =
            BigInt(i.quantity) *
            BigInt(i.unit_price) *
            BigInt(i.commission) *
            net;
          return n + Number((numerator + denominator / 2n) / denominator);
        }, 0);
        db.prepare(
          "INSERT OR IGNORE INTO commissions(appointment_id,professional_id,amount) VALUES(?,?,?)",
        ).run(a.id, a.professional_id, commission);
      }
    });
    audit(req.user, "status_" + b.status, a.id);
    res.json({ success: true });
  });
  app.get("/clients", admin, (_, res) =>
    res.json(
      db
        .prepare(
          "SELECT id,name,email,phone FROM users WHERE role='cliente' ORDER BY name",
        )
        .all(),
    ),
  );
  app.post("/payments", admin, (req, res) => {
    const b = z
      .object({
        appointment_id: integer,
        amount: integer,
        method: methods,
        request_key: z.string().min(10).max(100),
      })
      .parse(req.body);
    const result = transaction(db, () => {
      const existing = db
        .prepare("SELECT * FROM payments WHERE request_key=?")
        .get(b.request_key);
      if (existing) {
        if (
          existing.appointment_id !== b.appointment_id ||
          existing.amount !== b.amount ||
          existing.method !== b.method
        )
          fail("Chave já utilizada com outros dados", 409);
        return existing;
      }
      const a = db
        .prepare("SELECT * FROM appointments WHERE id=?")
        .get(b.appointment_id);
      if (!a || ["cancelado", "nao_compareceu"].includes(a.status))
        fail("Atendimento inválido");
      const paid =
        db
          .prepare(
            "SELECT COALESCE(SUM(amount),0) total FROM payments WHERE appointment_id=?",
          )
          .get(a.id).total -
        db
          .prepare(
            "SELECT COALESCE(SUM(r.amount),0) total FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=?",
          )
          .get(a.id).total;
      if (paid + b.amount > a.price) fail("Valor superior ao saldo pendente");
      if (
        b.method === "dinheiro" &&
        !db
          .prepare("SELECT 1 FROM cash_days WHERE date=? AND status='aberto'")
          .get(localDate())
      )
        fail("Abra o caixa antes de receber dinheiro");
      const id = Number(
        db
          .prepare(
            "INSERT INTO payments(appointment_id,amount,method,created_at,request_key) VALUES(?,?,?,?,?)",
          )
          .run(a.id, b.amount, b.method, now(), b.request_key).lastInsertRowid,
      );
      audit(req.user, "pagamento", id);
      return { id, ...b };
    });
    res.status(201).json(result);
  });
  app.get("/expenses", admin, (_, res) =>
    res.json(
      db.prepare("SELECT * FROM expenses ORDER BY date DESC LIMIT 500").all(),
    ),
  );
  app.post("/expenses", admin, (req, res) => {
    const b = z
      .object({
        description: z.string().trim().min(2).max(200),
        amount: integer,
        method: methods,
        date,
      })
      .parse(req.body);
    if (b.date !== localDate()) fail("Registre o pagamento na data atual");
    if (
      b.method === "dinheiro" &&
      !db
        .prepare("SELECT 1 FROM cash_days WHERE date=? AND status='aberto'")
        .get(b.date)
    )
      fail("Abra o caixa antes de pagar em dinheiro");
    const id = Number(
      db
        .prepare(
          "INSERT INTO expenses(description,amount,method,date) VALUES(?,?,?,?)",
        )
        .run(b.description, b.amount, b.method, b.date).lastInsertRowid,
    );
    audit(req.user, "despesa", id);
    res.status(201).json({ id, ...b });
  });
  app.get("/cash", admin, (_, res) => {
    closeDue(db);
    res.json(
      db.prepare("SELECT * FROM cash_days ORDER BY date DESC LIMIT 90").all(),
    );
  });
  app.post("/cash/open", admin, (req, res) => {
    const b = z.object({ initial: money }).parse(req.body);
    const d = localDate();
    if (db.prepare("SELECT 1 FROM cash_days WHERE date=?").get(d))
      fail("Caixa do dia já existente", 409);
    db.prepare("INSERT INTO cash_days(date,initial) VALUES(?,?)").run(
      d,
      b.initial,
    );
    audit(req.user, "abertura_caixa");
    res.status(201).json({ date: d, initial: b.initial });
  });
  app.post("/cash/:date/close", admin, (req, res) => {
    const d = date.parse(req.params.date);
    transaction(db, () => {
      const cash = db.prepare("SELECT * FROM cash_days WHERE date=?").get(d);
      if (!cash || cash.status !== "aberto") fail("Caixa não está aberto");
      const r = report(db, d, d);
      const spent = db
        .prepare(
          "SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE date=? AND method='dinheiro'",
        )
        .get(d).total;
      db.prepare(
        "UPDATE cash_days SET expected=?,status='aguardando_conferencia',closed_at=? WHERE date=?",
      ).run(cash.initial + r.byMethod.dinheiro - spent, now(), d);
      audit(req.user, "fechamento_caixa");
    });
    res.json({ success: true });
  });
  app.post("/cash/:date/reconcile", admin, (req, res) => {
    const d = date.parse(req.params.date);
    const b = z.object({ counted: money }).parse(req.body);
    if (
      !db
        .prepare(
          "UPDATE cash_days SET counted=?,status='conferido' WHERE date=? AND status='aguardando_conferencia'",
        )
        .run(b.counted, d).changes
    )
      fail("Caixa não disponível para conferência");
    audit(req.user, "conferencia_caixa");
    res.json({ success: true });
  });
  app.get("/reports", admin, (req, res) => {
    const b = z
      .object({ from: date, to: date })
      .refine((b) => b.from <= b.to)
      .parse(req.query);
    const r = report(db, b.from, b.to);
    if (req.query.format === "csv") {
      res.type("text/csv").attachment("relatorio.csv");
      const lines = [
        ["Indicador", "Valor (R$)"],
        ["Atendimentos concluídos", r.revenue / 100],
        ["Recebido", r.received / 100],
        ["Despesas pagas", r.expenses / 100],
        ["Resultado de caixa", r.result / 100],
        ["Pendente", r.outstanding / 100],
      ];
      return res.send("\uFEFF" + lines.map((l) => l.join(";")).join("\r\n"));
    }
    if (req.query.format === "pdf") {
      res.type("application/pdf").attachment("relatorio.pdf");
      const pdf = new PDFDocument({ margin: 50 });
      pdf.pipe(res);
      pdf.fontSize(22).text("Espaço Josiane Marine");
      pdf.fontSize(12).text(`Relatório: ${b.from} a ${b.to}`).moveDown();
      for (const [label, val] of [
        ["Atendimentos concluídos", r.revenue],
        ["Recebido", r.received],
        ["Despesas pagas", r.expenses],
        ["Resultado de caixa", r.result],
        ["Pendente dos atendimentos", r.outstanding],
      ])
        pdf.text(
          `${label}: ${(val / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        );
      pdf
        .moveDown()
        .text(
          "Faturamento: total das comandas concluídas (serviços e produtos), pela data do atendimento. Recebimentos: data do pagamento. Resultado: recebido menos despesas pagas; não representa lucro contábil.",
        );
      pdf.end();
      return;
    }
    res.json(r);
  });
  extensions(app, db, { admin, own, audit, notify }, "private");
  app.get("/audit", admin, (_, res) =>
    res.json(
      db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 200").all(),
    ),
  );
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({ message: "Verifique os campos", errors: err.issues });
    if (err.status)
      return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: "Não foi possível concluir a operação" });
  });
  return app;
}
