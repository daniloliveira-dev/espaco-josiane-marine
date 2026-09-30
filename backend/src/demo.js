import { openDb, transaction } from "./db.js";
import { hash } from "./auth.js";
import { QueryRepository } from "./app/Repositories/QueryRepository.js";

if (!process.env.DB_NAME?.toLowerCase().includes("demo"))
  throw Error("Defina DB_NAME com um nome que contenha 'demo'.");

const db = await openDb();
const queries = new QueryRepository(db);
const password = "DemoJosiane123!";
try {
  const existing = await queries.countUsers();
  if (existing.n) throw Error("Base demo já contém dados");
  await transaction(db, async () => {
    await queries.insertDemoAdmin(hash(password));
    await queries.insertDemoClient(hash(password));
    await queries.seedDemoServices();
    await queries.seedDemoProfessionals();
    await queries.seedDemoSkills();
    await queries.seedDemoProducts();
    await queries.seedDemoCommissionRules();
  });
  console.log(
    "Base demo criada. admin@demo.local / cliente@demo.local. Senha: " + password,
  );
} finally {
  await db.close();
}
