import { now, localDate, report, closeDue } from "./domain.js";
import { transaction } from "./db.js";
export function enqueue(db, userId, title, key) {
  if (key) {
    if (db.prepare("SELECT 1 FROM job_keys WHERE key=?").get(key)) return;
    db.prepare("INSERT INTO job_keys(key) VALUES(?)").run(key);
  }
  const id = Number(
    db
      .prepare(
        "INSERT INTO notifications(user_id,title,created_at) VALUES(?,?,?)",
      )
      .run(userId, title, now()).lastInsertRowid,
  );
  for (const p of db
    .prepare("SELECT token FROM push_devices WHERE user_id=? AND enabled=1")
    .all(userId))
    db.prepare(
      "INSERT OR IGNORE INTO push_queue(notification_id,token) VALUES(?,?)",
    ).run(id, p.token);
}
export function scheduledJobs(db) {
  transaction(db, () => {
    closeDue(db);
    const admins = db.prepare("SELECT id FROM users WHERE role='admin'").all();
    for (const c of db
      .prepare(
        "SELECT date FROM cash_days WHERE status='aguardando_conferencia'",
      )
      .all())
      for (const u of admins)
        enqueue(
          db,
          u.id,
          "Fechamento de caixa disponível para conferência: " + c.date,
          `cash-${c.date}-${u.id}`,
        );
    const end = new Date(Date.now() + 60 * 60000).toISOString();
    for (const a of db
      .prepare(
        "SELECT * FROM appointments WHERE start>? AND start<=? AND status='confirmado'",
      )
      .all(now(), end))
      enqueue(
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
    if (!db.prepare("SELECT 1 FROM monthly_reports WHERE month=?").get(month)) {
      db.prepare(
        "INSERT INTO monthly_reports(month,data,created_at) VALUES(?,?,?)",
      ).run(month, JSON.stringify(report(db, from, to)), now());
      for (const u of admins)
        enqueue(
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
  const rows = db
    .prepare(
      "SELECT q.*,n.title FROM push_queue q JOIN notifications n ON n.id=q.notification_id JOIN push_devices d ON d.token=q.token WHERE q.status='pending' AND q.attempts<5 AND q.next_attempt<=? AND d.enabled=1 LIMIT 50",
    )
    .all(now());
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
      rows.forEach((r, i) => {
        const ticket = result.data[i];
        if (ticket?.status === "ok")
          db.prepare(
            "UPDATE push_queue SET status='ticket',ticket_id=?,sent_at=? WHERE id=?",
          ).run(ticket.id, now(), r.id);
        else {
          db.prepare(
            "UPDATE push_queue SET status='failed',error=? WHERE id=?",
          ).run(ticket?.message || "Falha no envio", r.id);
          if (ticket?.details?.error === "DeviceNotRegistered")
            db.prepare("UPDATE push_devices SET enabled=0 WHERE token=?").run(
              r.token,
            );
        }
      });
    } catch (e) {
      for (const r of rows)
        db.prepare(
          "UPDATE push_queue SET attempts=attempts+1,next_attempt=?,error=? WHERE id=?",
        ).run(
          new Date(
            Date.now() + Math.min(3600000, 60000 * 2 ** r.attempts),
          ).toISOString(),
          e.message,
          r.id,
        );
    }
  }
  const receipts = db
    .prepare(
      "SELECT * FROM push_queue WHERE status='ticket' AND sent_at<? LIMIT 100",
    )
    .all(new Date(Date.now() - 15 * 60000).toISOString());
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
        db.prepare("UPDATE push_queue SET status=?,error=? WHERE id=?").run(
          receipt.status === "ok" ? "delivered" : "failed",
          receipt.message || null,
          r.id,
        );
        if (receipt.details?.error === "DeviceNotRegistered")
          db.prepare("UPDATE push_devices SET enabled=0 WHERE token=?").run(
            r.token,
          );
      }
    } catch (e) {
      console.error("Falha ao consultar recibos push:", e.message);
    }
  }
}
