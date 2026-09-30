import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { scheduledJobs, deliverPush } from "./jobs.js";
import { appConfig } from "./config/app.config.js";

const db = await openDb();
const app = createApp(db, process.env.JWT_SECRET);
await scheduledJobs(db);
let busy = false;
const timer = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    await scheduledJobs(db);
    await deliverPush(db);
  } catch (e) {
    console.error("Falha nos trabalhos agendados", e);
  } finally {
    busy = false;
  }
}, 60000);
const server = app.listen(appConfig.port, appConfig.host, () =>
  console.log("API pronta na porta " + appConfig.port),
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  server.close(() => {
    db.close().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
