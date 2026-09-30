import { z } from "zod";
import { fail } from "../domain.js";
import { QueryRepository } from "../app/Repositories/QueryRepository.js";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Data inválida",
  );

export async function ownAppointment(repository, req) {
  const queries = repository instanceof QueryRepository ? repository : new QueryRepository(repository);
  const appointment = await queries.findAppointment(Number(req.params.id));
  if (!appointment) fail("Agendamento não encontrado", 404);
  if (req.user.role !== "admin" && appointment.user_id !== req.user.id)
    fail("Acesso negado", 403);
  return appointment;
}

export function registerAppointmentQueryRoutes(app, { admin, controllers }) {
  app.get("/availability", async (req, res) => {
    const input = z
      .object({
        service_id: z.coerce.number().int().positive(),
        professional_id: z.coerce.number().int().positive(),
        date,
      })
      .parse(req.query);
    await controllers.appointments.availability(res, input);
  });

  app.get("/appointments", async (req, res) => {
    let dateFrom, dateTo;
    if (req.query.date) {
      const selectedDate = date.parse(req.query.date);
      dateFrom = `${selectedDate}T03:00:00.000Z`;
      const nextDay = new Date(`${selectedDate}T12:00:00.000Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      dateTo = `${nextDay.toISOString().slice(0, 10)}T03:00:00.000Z`;
    }
    await controllers.appointments.list(res, req.user, {
      from: dateFrom,
      to: dateTo,
    });
  });

  app.patch("/appointments/:id/status", admin, async (req, res) => {
    const input = z
      .object({
        status: z.enum([
          "confirmado",
          "em_atendimento",
          "concluido",
          "nao_compareceu",
        ]),
      })
      .parse(req.body);
    await controllers.appointments.updateStatus(
      res,
      req.user,
      Number(req.params.id),
      input.status,
    );
  });
}
