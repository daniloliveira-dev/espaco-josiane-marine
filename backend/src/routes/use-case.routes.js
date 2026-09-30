import { z } from "zod";

const integer = z.number().int().positive();
const methods = z.enum(["dinheiro", "pix", "debito", "credito"]);

export function registerPublicUseCaseRoutes(app, { authLimit, controllers }) {
  app.post("/auth/register", authLimit, async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.email().transform((value) => value.toLowerCase()),
        phone: z.string().max(30).default(""),
        password: z.string().min(10).max(128),
      })
      .parse(req.body);
    await controllers.users.register(res, input);
  });

  app.post("/auth/login", authLimit, async (req, res) => {
    const input = z
      .object({ email: z.email(), password: z.string().max(128) })
      .parse(req.body);
    await controllers.users.login(res, input);
  });
}

export function registerUserRoutes(app, { admin, controllers }) {
  app.get("/me", (req, res) => res.json(req.user));
  app.put("/me", async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        phone: z.string().max(30),
      })
      .parse(req.body);
    await controllers.users.updateProfile(res, req.user, input);
  });
  app.get("/notifications", async (req, res) =>
    controllers.users.listNotifications(res, req.user.id),
  );
  app.get("/clients", admin, async (_, res) =>
    controllers.clients.list(res),
  );
  app.get("/audit", admin, async (_, res) =>
    controllers.users.listAuditEntries(res),
  );
}

export function registerAppointmentRoutes(app, { controllers }) {
  app.post("/appointments", async (req, res) => {
    const input = z
      .object({
        service_id: integer,
        professional_id: integer,
        start: z.iso.datetime({ offset: true }),
        notes: z.string().max(500).default(""),
        user_id: integer.optional(),
      })
      .parse(req.body);
    await controllers.appointments.create(res, req.user, input);
  });

  app.patch("/appointments/:id/reschedule", async (req, res) => {
    const input = z
      .object({ start: z.iso.datetime({ offset: true }) })
      .parse(req.body);
    await controllers.appointments.reschedule(
      res,
      req.user,
      Number(req.params.id),
      input.start,
    );
  });

  app.patch("/appointments/:id/cancel", async (req, res) =>
    controllers.appointments.cancel(res, req.user, Number(req.params.id)),
  );
}

export function registerPaymentRoutes(app, { admin, controllers }) {
  app.post("/payments", admin, async (req, res) => {
    const input = z
      .object({
        appointment_id: integer,
        amount: integer,
        method: methods,
        request_key: z.string().min(10).max(100),
      })
      .parse(req.body);
    await controllers.payments.create(res, req.user, input);
  });
}