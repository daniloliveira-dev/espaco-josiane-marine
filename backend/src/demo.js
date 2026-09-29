// Somente base demonstrativa. Nunca execute contra a base real.
import { openDb } from "./db.js";
import { hash } from "./auth.js";
if (process.env.DATABASE_PATH && !process.env.DATABASE_PATH.includes("demo"))
  throw Error("Use um caminho de banco que contenha demo.");
const db = openDb(process.env.DATABASE_PATH || "./data/demo.sqlite");
if (db.prepare("SELECT COUNT(*) n FROM users").get().n)
  throw Error("Base demo já contém dados");
const password = "DemoJosiane123!";
db.prepare(
  "INSERT INTO users(name,email,password,role) VALUES('Josiane','admin@demo.local',?,'admin')",
).run(hash(password));
db.prepare(
  "INSERT INTO users(name,email,phone,password) VALUES('Marina','cliente@demo.local','31999990000',?)",
).run(hash(password));
db.exec(
  "INSERT INTO services(name,description,price,duration) VALUES('Corte e finalização','Um novo olhar para o seu estilo.',9000,60),('Manicure','Cuidado até nos pequenos detalhes.',4500,45),('Design de sobrancelhas','Realce sua expressão.',4000,30);INSERT INTO professionals(name) VALUES('Josiane Marine'),('Camila');INSERT INTO skills VALUES(1,1),(1,3),(2,2);INSERT INTO products(name,price,stock) VALUES('Shampoo profissional',6500,8);INSERT INTO commission_rules VALUES(1,20),(2,20),(3,20);",
);
db.close();
console.log(
  "Base demo criada. admin@demo.local / cliente@demo.local. Senha: " + password,
);
