export class SchedulingRepository {
  constructor(queryRepository) {
    this.queries = queryRepository;
  }

  findBookableService(serviceId) {
    return this.queries.findBookableService(serviceId);
  }

  professionalCanPerform(serviceId, professionalId) {
    return this.queries.professionalCanPerform(serviceId, professionalId);
  }

  getSettings() {
    return this.queries.getSettings();
  }

  hasConflict(professionalId, start, end, exceptAppointmentId) {
    return this.queries.hasSchedulingConflict(
      professionalId,
      start,
      end,
      exceptAppointmentId,
    );
  }
}