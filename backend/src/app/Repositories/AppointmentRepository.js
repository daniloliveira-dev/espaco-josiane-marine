import { Appointment } from "../Models/Appointment.js";

export class AppointmentRepository {
  constructor(queryRepository) {
    this.queries = queryRepository;
  }

  async clientExists(userId) {
    return Boolean(await this.queries.userExists(userId));
  }

  async create(input) {
    const result = await this.queries.createAppointmentRecord(input);
    const id = Number(result.lastInsertRowid);
    const commission =
      (await this.queries.commissionPercent(input.serviceId))?.percent || 0;
    await this.queries.insertServiceOrderItem(
      id,
      input.service.name,
      1,
      input.service.price,
      commission,
    );
    return id;
  }

  findById(id) {
    return this.queries.findAppointment(id).then(Appointment.fromRecord);
  }

  list({ userId, dateFrom, dateTo }) {
    return this.queries
      .listAppointments({ userId, dateFrom, dateTo })
      .then((rows) =>
        Appointment.fromRecords(rows).map((appointment) => ({
          ...appointment,
          paid: Number(appointment.paid),
        })),
      );
  }

  updateStatus(id, status) {
    return this.queries.updateAppointmentStatus(id, status);
  }

  settings() {
    return this.queries.getSettings();
  }

  netPaid(id) {
    return this.queries.appointmentNetPaid(id);
  }

  reschedule(id, start, end) {
    return this.queries.updateAppointmentWindow(id, start, end);
  }

  async restockAndRemoveAdditionalProducts(appointmentId) {
    for (const item of await this.queries.listAdditionalProductItems(appointmentId))
      await this.queries.changeProductStock(item.quantity, item.product_id);
    return this.queries.deleteAdditionalProductItems(appointmentId);
  }

  cancel(id) {
    return this.queries.cancelAppointment(id);
  }
}