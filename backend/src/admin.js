import { openDb } from "./db.js";
import { hash } from "./auth.js";
import { z } from "zod";
import { QueryRepository } from "./app/Repositories/QueryRepository.js";

async function readHidden(prompt) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function")
    throw Error("Execute o comando com um terminal interativo (TTY).");

  process.stdout.write(prompt);
  input.setEncoding("utf8");
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(Error("Operação cancelada."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") value += character;
      }
    };
    input.on("data", onData);
  });
}

const [rawName, rawEmail, ...extraArgs] = process.argv.slice(2);
if (!rawName || !rawEmail || extraArgs.length)
  throw Error('Uso: npm run admin:create -- "Nome" email');

const name = rawName.trim();
const email = rawEmail.trim().toLowerCase();
if (name.length < 2 || name.length > 100 || !z.email().safeParse(email).success)
  throw Error("Informe um nome válido e um e-mail válido.");

const password = await readHidden("Senha do administrador (mínimo 10 caracteres): ");
if (password.length < 10) throw Error("A senha deve ter pelo menos 10 caracteres.");
const confirmation = await readHidden("Confirme a senha: ");
if (password !== confirmation) throw Error("As senhas não conferem.");

const db = await openDb();
const queries = new QueryRepository(db);
try {
  if (await queries.existsUserByEmail(email))
    throw Error("Já existe um usuário com esse e-mail.");
  await queries.insertAdmin({ name, email, password: hash(password) });
  console.log(`Administrador criado para ${email}.`);
} finally {
  await db.close();
}
