export const now = () => new Date().toISOString();
export const localDate = (value = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
export function windowFor(db, serviceId, professionalId, start) {
  const service = db
    .prepare("SELECT * FROM services WHERE id=? AND active=1")
    .get(serviceId);
  if (
    !service ||
    !db
      .prepare(
        "SELECT 1 FROM skills JOIN professionals p ON p.id=professional_id WHERE service_id=? AND professional_id=? AND p.active=1",
      )
      .get(serviceId, professionalId)
  )
    fail("Serviço ou profissional indisponível");
  const s = new Date(start);
  if (!Number.isFinite(s.getTime()) || s <= new Date())
    fail("Escolha um horário futuro");
  const end = new Date(
    s.getTime() + (service.duration + service.buffer) * 60000,
  );
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(s);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    p.weekday,
  );
  const cfg = db.prepare("SELECT * FROM settings").get();
  const minute = Number(p.hour) * 60 + Number(p.minute);
  if (
    !JSON.parse(cfg.days).includes(weekday) ||
    minute < cfg.open_hour * 60 ||
    minute + service.duration + service.buffer > cfg.close_hour * 60 ||
    Number(p.minute) % 15
  )
    fail("Fora do horário de funcionamento");
  return { service, start: s.toISOString(), end: end.toISOString() };
}
export function assertAvailable(db, professionalId, start, end, except = 0) {
  if (
    db
      .prepare(
        "SELECT 1 FROM appointments WHERE professional_id=? AND status NOT IN ('cancelado','nao_compareceu') AND start<? AND end>? AND id<>?",
      )
      .get(professionalId, end, start, except) ||
    db
      .prepare(
        "SELECT 1 FROM blocks WHERE (professional_id=? OR professional_id IS NULL) AND start<? AND end>?",
      )
      .get(professionalId, end, start)
  )
    fail("Este horário não está mais disponível", 409);
}
export function report(db, from, to) {
  const apps = db
    .prepare(
      "SELECT a.*,u.name client,p.name professional FROM appointments a JOIN users u ON u.id=a.user_id JOIN professionals p ON p.id=a.professional_id WHERE date(a.start,'-3 hours')>=? AND date(a.start,'-3 hours')<=?",
    )
    .all(from, to);
  const payments = db
    .prepare(
      "SELECT * FROM payments WHERE date(created_at,'-3 hours') BETWEEN ? AND ?",
    )
    .all(from, to);
  const expenses = db
    .prepare("SELECT * FROM expenses WHERE date BETWEEN ? AND ?")
    .all(from, to);
  const completed = apps.filter((a) => a.status === "concluido");
  const revenue = completed.reduce((n, a) => n + a.price, 0);
  const refunded = db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) total FROM refunds WHERE date(created_at,'-3 hours') BETWEEN ? AND ?",
    )
    .get(from, to).total;
  const received = payments.reduce((n, p) => n + p.amount, 0) - refunded;
  const spent = expenses.reduce((n, e) => n + e.amount, 0);
  const outstanding = apps
    .filter((a) => !["cancelado", "nao_compareceu"].includes(a.status))
    .reduce(
      (n, a) =>
        n +
        Math.max(
          0,
          a.price -
            (db
              .prepare(
                "SELECT COALESCE(SUM(amount),0) total FROM payments WHERE appointment_id=?",
              )
              .get(a.id).total -
              db
                .prepare(
                  "SELECT COALESCE(SUM(r.amount),0) total FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=?",
                )
                .get(a.id).total),
        ),
      0,
    );
  return {
    from,
    to,
    revenue,
    received,
    refunded,
    commissions: db
      .prepare(
        "SELECT COALESCE(SUM(c.amount),0) total FROM commissions c JOIN appointments a ON a.id=c.appointment_id WHERE date(a.start,'-3 hours') BETWEEN ? AND ?",
      )
      .get(from, to).total,
    expenses: spent,
    result: received - spent,
    outstanding,
    attendances: completed.length,
    ticket: completed.length ? Math.round(revenue / completed.length) : 0,
    byMethod: Object.fromEntries(
      ["dinheiro", "pix", "debito", "credito"].map((m) => [
        m,
        payments
          .filter((p) => p.method === m)
          .reduce((n, p) => n + p.amount, 0) -
          db
            .prepare(
              "SELECT COALESCE(SUM(r.amount),0) total FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.method=? AND date(r.created_at,'-3 hours') BETWEEN ? AND ?",
            )
            .get(m, from, to).total,
      ]),
    ),
    appointments: apps,
  };
}
export function closeDue(db) {
  const d = localDate();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const cfg = db.prepare("SELECT * FROM settings").get();
  for (const cash of db
    .prepare("SELECT * FROM cash_days WHERE status='aberto'")
    .all()) {
    if (cash.date < d || (cash.date === d && time >= cfg.close_time)) {
      const r = report(db, cash.date, cash.date);
      db.prepare(
        "UPDATE cash_days SET expected=?,status='aguardando_conferencia',closed_at=? WHERE date=? AND status='aberto'",
      ).run(
        cash.initial +
          r.byMethod.dinheiro -
          db
            .prepare(
              "SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE date=? AND method='dinheiro'",
            )
            .get(cash.date).total,
        now(),
        cash.date,
      );
    }
  }
}
