import { openDb } from "./db.js";
import { hash } from "./auth.js";
const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password || password.length < 10)
  throw Error('Uso: npm run admin -- "Nome" email senha-com-10-caracteres');
const db = openDb();
db.prepare(
  "INSERT INTO users(name,email,password,role) VALUES(?,?,?,'admin')",
).run(name, email.toLowerCase().trim(), hash(password));
console.log("Administrador criado.");
db.close();
