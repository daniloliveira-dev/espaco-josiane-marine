import { now, localDate, report, closeDue } from "./domain.js";
import { transaction } from "./db.js";
import { QueryRepository } from "./app/Repositories/QueryRepository.js";

const queriesFor = (value) => value instanceof QueryRepository ? value : new QueryRepository(value);

export async function enqueue(db, userId, title, key) {
  const queries = queriesFor(db);
  if (key) {
    const inserted = await queries.insertJobKey(key);
    if (!inserted.changes) return;
  }
  const id = Number((await queries.createNotification(userId, title, now())).lastInsertRowid);
  for (const p of await queries.listEnabledPushTokens(userId))
    await queries.enqueuePush(id, p.token);
  return id;
}
export async function scheduledJobs(db) {
  const queries = queriesFor(db);
  await transaction(db, async () => {
    await closeDue(queries);
    const admins = await queries.listAdminUsers();
    for (const c of await queries.listCashDaysForReconciliation())
      for (const u of admins)
        await enqueue(
          db,
          u.id,
          "Fechamento de caixa disponível para conferência: " + c.date,
          `cash-${c.date}-${u.id}`,
        );
    const end = new Date(Date.now() + 60 * 60000).toISOString();
    for (const a of await queries.listUpcomingAppointments(now(), end))
      await enqueue(
        db,
        a.user_id,
        "Seu atendimento começa em até uma hora. Confira seu horário no app.",
        `reminder-${a.id}-${a.start}`,
      );
    const d = localDate();
    const previous = new Date(d.slice(0, 7) + "-01T12:00:00Z");
    previous.setUTCDate(0);
    const to = previous.toISOString().slice(0, 10),
      from = to.slice(0, 7) + "-01",
      month = to.slice(0, 7);
    const reportResult = await queries.saveMonthlyReport(month, JSON.stringify(await report(queries, from, to)), now());
    if (reportResult.changes) {
      for (const u of admins)
        await enqueue(
          db,
          u.id,
          "Relatório mensal disponível: " + month,
          `monthly-${month}-${u.id}`,
        );
    }
  });
}
const headers = () => ({
  "Content-Type": "application/json",
  ...(process.env.EXPO_ACCESS_TOKEN
    ? { Authorization: "Bearer " + process.env.EXPO_ACCESS_TOKEN }
    : {}),
});
export async function deliverPush(db) {
  if (process.env.PUSH_ENABLED !== "true") return;
  const queries = queriesFor(db);
  const rows = await queries.pendingPushBatch(now());
  if (rows.length) {
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(
          rows.map((r) => ({
            to: r.token,
            title: "Espaço Josiane Marine",
            body: r.title,
            sound: "default",
            data: { notificationId: r.notification_id },
          })),
        ),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error("Expo respondeu " + response.status);
      const result = await response.json();
      if (!Array.isArray(result.data)) throw Error("Resposta push inválida");
      for (const [i, r] of rows.entries()) {
        const ticket = result.data[i];
        if (ticket?.status === "ok")
          await queries.markPushTicket(ticket.id, now(), r.id);
        else {
          await queries.markPushFailed(ticket?.message || "Falha no envio", r.id);
          if (ticket?.details?.error === "DeviceNotRegistered")
            await queries.disablePushDevice(r.token);
        }
      }
    } catch (e) {
      for (const r of rows)
        await queries.retryPush(
          new Date(
            Date.now() + Math.min(3600000, 60000 * 2 ** r.attempts),
          ).toISOString(),
          e.message,
          r.id,
        );
    }
  }
  const receipts = await queries.pendingPushReceipts(new Date(Date.now() - 15 * 60000).toISOString());
  if (receipts.length) {
    try {
      const response = await fetch(
        "https://exp.host/--/api/v2/push/getReceipts",
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ ids: receipts.map((r) => r.ticket_id) }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) return;
      const { data } = await response.json();
      for (const r of receipts) {
        const receipt = data?.[r.ticket_id];
        if (!receipt) continue;
        await queries.updatePushReceipt(
          receipt.status === "ok" ? "delivered" : "failed",
          receipt.message || null,
          r.id,
        );
        if (receipt.details?.error === "DeviceNotRegistered")
          await queries.disablePushDevice(r.token);
      }
    } catch (e) {
      console.error("Falha ao consultar recibos push:", e.message);
    }
  }
}
