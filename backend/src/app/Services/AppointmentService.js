import { fail } from "../../domain.js";

export class AppointmentService {
  constructor({ repository, scheduling, queries, transaction, audit }) {
    Object.assign(this, { repository, scheduling, queries, transaction, audit });
  }

  availability(input) {
    return this.scheduling.availability(input);
  }

  list(user, range) {
    return this.repository.list({
      userId: user.role === "admin" ? null : user.id,
      dateFrom: range?.from,
      dateTo: range?.to,
    });
  }

  async updateStatus(user, id, status) {
    const appointment = await this.repository.findById(id);
    if (!appointment) fail("Agendamento não encontrado", 404);
    const transitions = {
      confirmado: ["em_atendimento", "nao_compareceu"],
      em_atendimento: ["concluido"],
      aguardando_confirmacao: ["confirmado"],
    };
    if (!transitions[appointment.status]?.includes(status))
      fail("Transição de status inválida");

    await this.transaction(async () => {
      await this.repository.updateStatus(appointment.id, status);
      if (status === "concluido") {
        const items = await this.queries.listServiceItems(appointment.id);
        const adjustment = await this.queries.findOrderAdjustment(appointment.id);
        const gross = (await this.queries.orderGross(appointment.id)).total;
        const net = BigInt(Math.max(0, gross - (adjustment?.discount || 0)));
        const denominator = BigInt(gross || 1) * 100n;
        const commission = items.reduce((sum, item) => {
          const numerator = BigInt(item.quantity) * BigInt(item.unit_price) * BigInt(item.commission) * net;
          return sum + Number((numerator + denominator / 2n) / denominator);
        }, 0);
        await this.queries.createCommission(appointment.id, appointment.professional_id, commission);
      }
    });
    await this.audit.record(user, "status_" + status, appointment.id);
    return { success: true };
  }
}