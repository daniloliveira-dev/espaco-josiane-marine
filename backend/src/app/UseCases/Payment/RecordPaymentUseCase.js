import { fail, localDate, now } from "../../../domain.js";

export class RecordPaymentUseCase {
  constructor({ payments, transaction, audit, today = localDate, clock = now }) {
    Object.assign(this, { payments, transaction, audit, today, clock });
  }

  async execute(user, input) {
    return this.transaction(async () => {
      const existing = await this.payments.findByRequestKey(input.request_key);
      if (existing) {
        if (existing.appointment_id !== input.appointment_id || existing.amount !== input.amount || existing.method !== input.method)
          fail("Chave já utilizada com outros dados", 409);
        return existing;
      }
      const appointment = await this.payments.findAppointment(input.appointment_id);
      if (!appointment || ["cancelado", "nao_compareceu"].includes(appointment.status)) fail("Atendimento inválido");
      if ((await this.payments.netPaid(appointment.id)) + input.amount > appointment.price) fail("Valor superior ao saldo pendente");
      if (input.method === "dinheiro" && !(await this.payments.isCashOpen(this.today()))) fail("Abra o caixa antes de receber dinheiro");
      const payment = await this.payments.create({
        appointmentId: appointment.id,
        amount: input.amount,
        method: input.method,
        createdAt: this.clock(),
        requestKey: input.request_key,
      });
      await this.audit.record(user, "pagamento", payment.id);
      return { id: payment.id, ...input };
    });
  }
}