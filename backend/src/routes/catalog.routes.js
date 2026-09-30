import { z } from "zod";
import { fail } from "../domain.js";
import { transaction } from "../db.js";

const integer = z.number().int().positive();
const money = z.number().int().min(0);

export function registerCatalogRoutes(app, { db, queries, controllers, admin, audit }) {
  app.get("/services", async (req, res) =>
    controllers.services.list(res, req.user),
  );

  const serviceSchema = z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().max(500).default(""),
    price: money,
    duration: integer.max(600),
    buffer: money.max(120).default(0),
    active: z.number().int().min(0).max(1).default(1),
  });
  app.post("/services", admin, async (req, res) => {
    const body = serviceSchema.parse(req.body);
    await controllers.services.create(res, req.user, body);
  });
  app.put("/services/:id", admin, async (req, res) => {
    const body = serviceSchema.parse(req.body);
    await controllers.services.update(res, req.user, Number(req.params.id), body);
  });

  app.get("/professionals", async (req, res) => {
    await controllers.professionals.list(res, req.user);
  });

  const professionalSchema = z.object({
    name: z.string().trim().min(2).max(100),
    active: z.number().int().min(0).max(1).default(1),
    service_ids: z.array(integer).min(1),
  });
  app.post("/professionals", admin, async (req, res) =>
    controllers.professionals.create(res, professionalSchema.parse(req.body)),
  );
  app.put("/professionals/:id", admin, async (req, res) =>
    controllers.professionals.update(
      res,
      Number(req.params.id),
      professionalSchema.parse(req.body),
    ),
  );

  app.get("/settings", admin, async (_, res) => {
    const settings = await queries.getSettings();
    res.json({ ...settings, days: JSON.parse(settings.days) });
  });
  app.put("/settings", admin, async (req, res) => {
    const body = z
      .object({
        open_hour: z.number().int().min(0).max(23),
        close_hour: z.number().int().min(1).max(24),
        close_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        days: z.array(z.number().int().min(0).max(6)).min(1),
        cancel_hours: money.max(168),
      })
      .refine((settings) => settings.close_hour > settings.open_hour)
      .parse(req.body);
    await queries.updateSettings({ ...body, days: JSON.stringify(body.days) });
    await audit(req.user, "configuracao_alterada");
    res.json(body);
  });

  app.get("/blocks", admin, async (_, res) =>
    res.json(await queries.listBlocks()),
  );
  app.post("/blocks", admin, async (req, res) => {
    const body = z
      .object({
        professional_id: integer.nullable(),
        start: z.iso.datetime({ offset: true }),
        end: z.iso.datetime({ offset: true }),
        reason: z.string().max(200),
      })
      .refine((block) => new Date(block.end) > new Date(block.start))
      .parse(req.body);
    const id = await transaction(db, async () => {
      const start = new Date(body.start).toISOString();
      const end = new Date(body.end).toISOString();
      const overlap = await queries.overlappingAppointments(body.professional_id, end, start);
      if (overlap)
        fail("Reagende os atendimentos deste período antes de bloquear", 409);
      return Number((await queries.createBlock(body.professional_id, start, end, body.reason)).lastInsertRowid);
    });
    res.status(201).json({ id, ...body });
  });
  app.delete("/blocks/:id", admin, async (req, res) => {
    await queries.deleteBlock(Number(req.params.id));
    res.status(204).end();
  });
}
