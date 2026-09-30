import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { createApp } from "../src/app.js";
import { hash } from "../src/auth.js";
import { localDate, closeDue } from "../src/domain.js";
import { QueryRepository } from "../src/app/Repositories/QueryRepository.js";
let db, server, base, admin, client, other, appointment;
const day = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return localDate(d);
};
async function request(path, method = "GET", body, token = client) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}
before(async () => {
  process.env.DB_NAME = process.env.DB_TEST_NAME || "salon_test";
  db = await openDb();
  db.queries = new QueryRepository(db);
  await db.queries.resetIntegrationFixtures();
  await db.queries.insertAdmin({
    name: "ADM",
    email: "admin@example.test",
    password: hash("abcdefghijk"),
  });
  await db.queries.configureIntegrationSettings();
  server = createApp(
    db,
    "test-secret-with-more-than-thirty-two-characters",
  ).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
  admin = (
    await request(
      "/auth/login",
      "POST",
      { email: "admin@example.test", password: "abcdefghijk" },
      null,
    )
  ).body.token;
  client = (
    await request(
      "/auth/register",
      "POST",
      {
        name: "Cliente",
        email: "c@example.test",
        password: "abcdefghijk",
        role: "admin",
      },
      null,
    )
  ).body.token;
  other = (
    await request(
      "/auth/register",
      "POST",
      { name: "Outro", email: "o@example.test", password: "abcdefghijk" },
      null,
    )
  ).body.token;
  await request(
    "/services",
    "POST",
    { name: "Corte", price: 9000, duration: 90 },
    admin,
  );
  await request(
    "/professionals",
    "POST",
    { name: "Josiane", service_ids: [1] },
    admin,
  );
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) await db.close();
});
test("cadastro público não promove ADM e cliente não acessa financeiro", async () => {
  assert.equal((await request("/me")).body.role, "cliente");
  assert.equal(
    (await request("/reports?from=2026-01-01&to=2026-12-31")).status,
    403,
  );
  assert.equal(
    (
      await request("/services", "POST", {
        name: "Teste",
        price: 100,
        duration: 30,
      })
    ).status,
    403,
  );
});
test("reserva simultânea, duração e isolamento de cliente", async () => {
  const payload = {
    service_id: 1,
    professional_id: 1,
    start: day() + "T10:00:00-03:00",
    user_id: 3,
  };
  const rs = await Promise.all([
    request("/appointments", "POST", payload),
    request("/appointments", "POST", payload),
  ]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]);
  appointment = rs.find((r) => r.status === 201).body.id;
  assert.equal(
    (await request("/appointments", "GET", undefined, other)).body.length,
    0,
  );
  assert.equal(
    (
      await request(
        "/appointments/" + appointment + "/cancel",
        "PATCH",
        {},
        other,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/appointments", "POST", {
        ...payload,
        start: day() + "T18:00:00-03:00",
      })
    ).status,
    400,
  );
  const slots = (
    await request("/availability?service_id=1&professional_id=1&date=" + day())
  ).body;
  assert.ok(!slots.some((s) => s.label === "10:30"));
});
test("preço histórico, cancelamento libera horário e cliente não altera status", async () => {
  await request(
    "/services/1",
    "PUT",
    { name: "Corte", price: 10000, duration: 90 },
    admin,
  );
  assert.equal((await request("/appointments")).body[0].price, 9000);
  assert.equal(
    (
      await request("/appointments/" + appointment + "/status", "PATCH", {
        status: "concluido",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/appointments/" + appointment + "/cancel", "PATCH", {}))
      .status,
    200,
  );
  assert.ok(
    (
      await request(
        "/availability?service_id=1&professional_id=1&date=" + day(),
      )
    ).body.some((s) => s.label === "10:00"),
  );
  appointment = (
    await request("/appointments", "POST", {
      service_id: 1,
      professional_id: 1,
      start: day() + "T10:00:00-03:00",
    })
  ).body.id;
});
test("sinal, idempotência e dinheiro físico separado de Pix", async () => {
  await request("/cash/open", "POST", { initial: 1000 }, admin);
  const payment = {
    appointment_id: appointment,
    amount: 3000,
    method: "pix",
    request_key: "unique-payment-key",
  };
  assert.equal(
    (await request("/payments", "POST", payment, admin)).status,
    201,
  );
  await request("/payments", "POST", payment, admin);
  assert.equal((await db.queries.countPayments()).n, 1);
  assert.equal(
    (await request("/payments", "POST", { ...payment, amount: 4000 }, admin))
      .status,
    409,
  );
  await request(
    "/payments",
    "POST",
    {
      ...payment,
      amount: 2000,
      method: "dinheiro",
      request_key: "cash-payment-key",
    },
    admin,
  );
  await request(
    "/expenses",
    "POST",
    {
      description: "Material",
      amount: 500,
      method: "dinheiro",
      date: localDate(),
    },
    admin,
  );
  await request("/cash/" + localDate() + "/close", "POST", {}, admin);
  const cash = (await request("/cash", "GET", undefined, admin)).body[0];
  assert.equal(cash.expected, 2500);
  assert.equal(cash.status, "aguardando_conferencia");
  assert.equal(
    (
      await request(
        "/payments",
        "POST",
        {
          ...payment,
          amount: 100,
          method: "dinheiro",
          request_key: "closed-cash-key",
        },
        admin,
      )
    ).status,
    400,
  );
  await request(
    "/cash/" + localDate() + "/reconcile",
    "POST",
    { counted: 2400 },
    admin,
  );
  assert.equal(
    (
      await request(
        "/cash/" + localDate() + "/reconcile",
        "POST",
        { counted: 0 },
        admin,
      )
    ).status,
    400,
  );
  const r = (
    await request(
      "/reports?from=" + localDate() + "&to=" + day(),
      "GET",
      undefined,
      admin,
    )
  ).body;
  assert.equal(r.received, 5000);
  assert.equal(r.outstanding, 5000);
  assert.equal(r.result, 4500);
});
test("fechamento automático recupera caixa antigo e não duplica", async () => {
  await db.queries.createCashDay("2020-01-01", 500);
  await closeDue(db);
  await closeDue(db);
  const row = await db.queries.findCashDay("2020-01-01");
  assert.equal(row.expected, 500);
  assert.equal(row.status, "aguardando_conferencia");
});

test("comanda, desconto, estoque, comissão e estorno sem duplicação", async () => {
  await request("/commission-rules/1", "PUT", { percent: 20 }, admin);
  const next = (
    await request(
      "/appointments",
      "POST",
      { service_id: 1, professional_id: 1, start: day() + "T14:00:00-03:00" },
      client,
    )
  ).body.id;
  const product = (
    await request(
      "/products",
      "POST",
      { name: "Shampoo", price: 2000, stock: 2 },
      admin,
    )
  ).body;
  assert.equal(
    (
      await request(
        "/appointments/" + next + "/order/items",
        "POST",
        { kind: "produto", item_id: product.id, quantity: 3 },
        admin,
      )
    ).status,
    400,
  );
  await request(
    "/appointments/" + next + "/order/items",
    "POST",
    { kind: "produto", item_id: product.id, quantity: 1 },
    admin,
  );
  await request(
    "/appointments/" + next + "/order/adjustment",
    "PUT",
    { discount: 1200, extra: 0, reason: "Promoção" },
    admin,
  );
  assert.equal(
    (await request("/appointments/" + next + "/order", "GET", undefined, admin))
      .body.appointment.price,
    10800,
  );
  await request(
    "/appointments/" + next + "/status",
    "PATCH",
    { status: "em_atendimento" },
    admin,
  );
  await request(
    "/appointments/" + next + "/status",
    "PATCH",
    { status: "concluido" },
    admin,
  );
  const commission = (
    await request("/commissions", "GET", undefined, admin)
  ).body.find((c) => c.appointment_id === next);
  assert.equal(commission.amount, 1800);
  await request(
    "/commissions/" + next + "/pay",
    "POST",
    { method: "pix" },
    admin,
  );
  assert.equal(
    (
      await request(
        "/commissions/" + next + "/pay",
        "POST",
        { method: "pix" },
        admin,
      )
    ).status,
    400,
  );
  const paid = (
    await request(
      "/payments",
      "POST",
      {
        appointment_id: next,
        amount: 10800,
        method: "pix",
        request_key: "new-order-payment",
      },
      admin,
    )
  ).body;
  const body = {
    payment_id: paid.id,
    amount: 1000,
    reason: "Devolução parcial",
    request_key: "refund-order-unique",
  };
  await request("/refunds", "POST", body, admin);
  await request("/refunds", "POST", body, admin);
  assert.equal((await db.queries.countRefunds()).n, 1);
  assert.equal(
    (await request("/appointments")).body.find((a) => a.id === next).paid,
    9800,
  );
  assert.equal(
    (
      await request(
        "/refunds",
        "POST",
        { ...body, amount: 10000, request_key: "overflow-refund-key" },
        admin,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("/products", "GET", undefined, client)).status,
    403,
  );
});
test("redefinição de senha invalida sessões e código é de uso único", async () => {
  const { createHash } = await import("node:crypto");
  const token = "a".repeat(64);
  const user = await db.queries.findUserByEmail("o@example.test");
  await db.queries.createPasswordReset(
    createHash("sha256").update(token).digest("hex"),
    user.id,
    new Date(Date.now() + 60000).toISOString(),
  );
  assert.equal(
    (
      await request(
        "/auth/reset",
        "POST",
        { token, password: "new-password-strong" },
        null,
      )
    ).status,
    200,
  );
  assert.equal((await request("/me", "GET", undefined, other)).status, 401);
  assert.equal(
    (
      await request(
        "/auth/reset",
        "POST",
        { token, password: "new-password-strong" },
        null,
      )
    ).status,
    400,
  );
});

test("relatório mensal e lembretes são gerados uma vez", async () => {
  const { scheduledJobs } = await import("../src/jobs.js");
  await scheduledJobs(db);
  const count = (await db.queries.countMonthlyReports()).n;
  const notices = (await db.queries.countNotifications()).n;
  await scheduledJobs(db);
  assert.equal(
    (await db.queries.countMonthlyReports()).n,
    count,
  );
  assert.equal(
    (await db.queries.countNotifications()).n,
    notices,
  );
  assert.equal(
    (await request("/monthly-reports", "GET", undefined, client)).status,
    403,
  );
  assert.ok(
    (await request("/monthly-reports", "GET", undefined, admin)).body.length >
      0,
  );
});

test("relatórios exportam PDF/CSV apenas para ADM", async () => {
  const params = "?from=" + localDate() + "&to=" + day();
  const pdf = await fetch(base + "/reports" + params + "&format=pdf", {
    headers: { Authorization: "Bearer " + admin },
  });
  assert.equal(pdf.status, 200);
  assert.ok((await pdf.text()).startsWith("%PDF"));
  const csv = await fetch(base + "/reports" + params + "&format=csv", {
    headers: { Authorization: "Bearer " + admin },
  });
  assert.equal(csv.status, 200);
  assert.ok((await csv.text()).includes("Recebido"));
  assert.equal(
    (await request("/reports" + params + "&format=pdf")).status,
    403,
  );
});
