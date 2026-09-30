import { SchedulingService } from "./app/Services/SchedulingService.js";
import { SchedulingRepository } from "./app/Repositories/SchedulingRepository.js";
import { QueryRepository } from "./app/Repositories/QueryRepository.js";

const queryRepositoryFor = (db) =>
  db instanceof QueryRepository ? db : new QueryRepository(db);

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
  return new SchedulingService(
    new SchedulingRepository(queryRepositoryFor(db)),
  ).windowFor(
    serviceId,
    professionalId,
    start,
  );
}
export function assertAvailable(db, professionalId, start, end, except = 0) {
  return new SchedulingService(
    new SchedulingRepository(queryRepositoryFor(db)),
  ).assertAvailable(
    professionalId,
    start,
    end,
    except,
  );
}
const reportWindow = (from, to) => {
  const toExclusive = new Date(`${to}T12:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return [`${from}T03:00:00.000Z`, `${toExclusive.toISOString().slice(0, 10)}T03:00:00.000Z`];
};

export async function report(db, from, to) {
  const queries = db instanceof QueryRepository ? db : new QueryRepository(db);
  const [start, end] = reportWindow(from, to);
  const apps = await queries.reportAppointments(start, end);
  const payments = await queries.reportPayments(start, end);
  const refunds = await queries.reportRefunds(start, end);
  const expenses = await queries.reportExpenses(from, to);
  const completed = apps.filter((a) => a.status === "concluido");
  const revenue = completed.reduce((n, a) => n + a.price, 0);
  const refunded = refunds.reduce((sum, refund) => sum + refund.amount, 0);
  const received = payments.reduce((n, p) => n + p.amount, 0) - refunded;
  const spent = expenses.reduce((n, e) => n + e.amount, 0);
  let outstanding = 0;
  for (const appointment of apps) {
    if (["cancelado", "nao_compareceu"].includes(appointment.status)) continue;
    const paid = await queries.paidTotal(appointment.id);
    const returned = await queries.refundedTotalForAppointment(appointment.id);
    outstanding += Math.max(0, appointment.price - (paid.total - returned.total));
  }
  return {
    from,
    to,
    revenue,
    received,
    refunded,
    commissions: (await queries.reportCommissionTotal(start, end)).total,
    expenses: spent,
    result: received - spent,
    outstanding,
    attendances: completed.length,
    ticket: completed.length ? Math.round(revenue / completed.length) : 0,
    byMethod: Object.fromEntries(
      ["dinheiro", "pix", "debito", "credito"].map((method) => [
        method,
        payments
          .filter((payment) => payment.method === method)
          .reduce((sum, payment) => sum + payment.amount, 0) -
          refunds
            .filter((refund) => refund.method === method)
            .reduce((sum, refund) => sum + refund.amount, 0),
      ]),
    ),
    appointments: apps,
  };
}
export async function closeDue(db) {
  const queries = db instanceof QueryRepository ? db : new QueryRepository(db);
  const d = localDate();
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const cfg = await queries.getSettings();
  for (const cash of await queries.openCashDays()) {
    if (cash.date < d || (cash.date === d && time >= cfg.close_time)) {
      const r = await report(queries, cash.date, cash.date);
      await queries.closeCashDay(
        cash.initial +
          r.byMethod.dinheiro -
          (await queries.cashExpenseTotal(cash.date)).total,
        now(),
        cash.date,
      );
    }
  }
}
