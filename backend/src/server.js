import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { scheduledJobs, deliverPush } from "./jobs.js";
const db = openDb();
const app = createApp(db, process.env.JWT_SECRET);
scheduledJobs(db);
let busy = false;
const timer = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    scheduledJobs(db);
    await deliverPush(db);
  } catch (e) {
    console.error("Falha nos trabalhos agendados", e);
  } finally {
    busy = false;
  }
}, 60000);
const server = app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log("API pronta na porta " + (process.env.PORT || 3000)),
);
function stop() {
  clearInterval(timer);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
