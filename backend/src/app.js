import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { hash } from "./auth.js";
import { createContainer } from "./container.js";
import { appConfig } from "./config/app.config.js";
import { closeDue } from "./domain.js";
import {
  ownAppointment,
  registerPrivateRoutes,
  registerPublicRoutes,
} from "./routes/index.js";

export function createApp(db, secret, dependencies) {
  if (!secret || secret.length < 32)
    throw Error("Defina JWT_SECRET com pelo menos 32 caracteres");
  const container = dependencies || createContainer(db, secret);
  const { services, controllers, repositories } = container;
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: appConfig.corsOrigins }));
  app.use(express.json({ limit: "100kb" }));
  app.use(rateLimit({ windowMs: 60000, limit: 180 }));
  const authLimit = rateLimit({ windowMs: 15 * 60000, limit: 30 });
  const audit = (user, action, id) => services.audit.record(user, action, id);
  const notify = (userId, title) => services.notifications.notify(userId, title);

  registerPublicRoutes(app, {
    authLimit,
    controllers,
    db,
    queries: repositories.queries,
    extensionContext: {
      authLimit,
      session: (user) => services.sessions.create(user),
      hash,
      queries: repositories.queries,
      audit,
      notify,
    },
  });

  app.use(async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      req.user = await controllers.users.authenticate(token || "");
      next();
    } catch {
      res.status(401).json({ message: "Entre novamente para continuar" });
    }
  });
  app.use(async (req, res, next) => {
    try {
      await closeDue(repositories.queries);
      next();
    } catch (error) {
      next(error);
    }
  });
  const admin = (req, res, next) =>
    req.user.role === "admin"
      ? next()
      : res.status(403).json({ message: "Acesso exclusivo do administrador" });

  registerPrivateRoutes(app, {
    db,
    queries: repositories.queries,
    admin,
    audit,
    notify,
    closeDue: () => closeDue(repositories.queries),
    controllers,
    ownAppointment: (req) => ownAppointment(repositories.queries, req),
  });

  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({ message: "Verifique os campos", errors: err.issues });
    if (err.status)
      return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: "Não foi possível concluir a operação" });
  });
  return app;
}
