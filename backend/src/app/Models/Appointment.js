export class Appointment {
  constructor(record) {
    Object.assign(this, record);
  }

  static fromRecord(record) {
    return record ? new Appointment(record) : null;
  }

  static fromRecords(records) {
    return records.map((record) => new Appointment(record));
  }
}