export class Professional {
  constructor(record) {
    Object.assign(this, record);
  }

  static fromRecord(record) {
    return record ? new Professional(record) : null;
  }

  static fromRecords(records) {
    return records.map((record) => new Professional(record));
  }
}