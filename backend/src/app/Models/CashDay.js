export class CashDay {
  constructor(record) {
    Object.assign(this, record);
  }

  static fromRecord(record) {
    return record ? new CashDay(record) : null;
  }

  static fromRecords(records) {
    return records.map((record) => new CashDay(record));
  }
}