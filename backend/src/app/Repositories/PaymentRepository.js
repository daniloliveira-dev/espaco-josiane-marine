export class PaymentRepository {
  constructor(queryRepository) {
    this.queries = queryRepository;
  }

  findByRequestKey(key) {
    return this.queries.findPaymentByRequestKey(key);
  }

  findAppointment(id) {
    return this.queries.findAppointment(id);
  }

  netPaid(appointmentId) {
    return this.queries.netPaidForPayment(appointmentId);
  }

  isCashOpen(date) {
    return this.queries.isCashDayOpen(date);
  }

  create(input) {
    return this.queries.createPayment(input);
  }
}