export class Service {
  constructor(record) {
    Object.assign(this, record);
  }

  static fromRecord(record) {
    return record ? new Service(record) : null;
  }

  static fromRecords(records) {
    return records.map((record) => new Service(record));
  }
}