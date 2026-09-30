import { fail } from "../../../domain.js";

export class CreateAppointmentUseCase {
  constructor({ appointments, scheduling, transaction, audit, notifications }) {
    Object.assign(this, { appointments, scheduling, transaction, audit, notifications });
  }

  async execute(user, input) {
    return this.transaction(async () => {
      const userId = user.role === "admin" ? input.user_id || user.id : user.id;
      if (!(await this.appointments.clientExists(userId))) fail("Cliente inválido");
      const window = await this.scheduling.windowFor(input.service_id, input.professional_id, input.start);
      await this.scheduling.assertAvailable(input.professional_id, window.start, window.end);
      const id = await this.appointments.create({
        userId,
        serviceId: input.service_id,
        professionalId: input.professional_id,
        start: window.start,
        end: window.end,
        service: window.service,
        notes: input.notes,
      });
      await this.audit.record(user, "agendamento_criado", id);
      await this.notifications.notify(userId, "Seu agendamento foi confirmado");
      return { id };
    });
  }
}

export class RescheduleAppointmentUseCase {
  constructor({ appointments, scheduling, transaction, audit, notifications }) {
    Object.assign(this, { appointments, scheduling, transaction, audit, notifications });
  }

  async execute(user, appointmentId, start) {
    return this.transaction(async () => {
      const appointment = await this.#ownedAppointment(user, appointmentId);
      await this.#assertCanChange(user, appointment);
      const window = await this.scheduling.windowFor(appointment.service_id, appointment.professional_id, start);
      await this.scheduling.assertAvailable(appointment.professional_id, window.start, window.end, appointment.id);
      await this.appointments.reschedule(appointment.id, window.start, window.end);
      await this.audit.record(user, "reagendamento", appointment.id);
      await this.notifications.notify(appointment.user_id, "Seu agendamento foi reagendado");
      return { success: true };
    });
  }

  async #ownedAppointment(user, id) {
    const appointment = await this.appointments.findById(id);
    if (!appointment) fail("Agendamento não encontrado", 404);
    if (user.role !== "admin" && appointment.user_id !== user.id) fail("Acesso negado", 403);
    return appointment;
  }

  async #assertCanChange(user, appointment) {
    if (!["confirmado", "aguardando_confirmacao"].includes(appointment.status)) fail("Este agendamento não pode ser alterado");
    if (user.role !== "admin") {
      const settings = await this.appointments.settings();
      if (new Date(appointment.start) - new Date() < settings.cancel_hours * 3600000)
        fail(`Alterações exigem antecedência de ${settings.cancel_hours} horas`);
    }
  }
}

export class CancelAppointmentUseCase {
  constructor({ appointments, transaction, audit, notifications }) {
    Object.assign(this, { appointments, transaction, audit, notifications });
  }

  async execute(user, appointmentId) {
    return this.transaction(async () => {
      const appointment = await this.appointments.findById(appointmentId);
      if (!appointment) fail("Agendamento não encontrado", 404);
      if (user.role !== "admin" && appointment.user_id !== user.id) fail("Acesso negado", 403);
      if (!["confirmado", "aguardando_confirmacao"].includes(appointment.status)) fail("Este agendamento não pode ser alterado");
      if (user.role !== "admin") {
        const settings = await this.appointments.settings();
        if (new Date(appointment.start) - new Date() < settings.cancel_hours * 3600000)
          fail(`Alterações exigem antecedência de ${settings.cancel_hours} horas`);
      }
      if ((await this.appointments.netPaid(appointment.id)) > 0) fail("Agendamento com pagamento: contate o salão para estorno");
      await this.appointments.restockAndRemoveAdditionalProducts(appointment.id);
      await this.appointments.cancel(appointment.id);
      await this.audit.record(user, "cancelamento", appointment.id);
      await this.notifications.notify(appointment.user_id, "Seu agendamento foi cancelado");
      return { success: true };
    });
  }
}