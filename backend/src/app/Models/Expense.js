export class Expense {
  constructor(record) {
    Object.assign(this, record);
  }

  static fromRecord(record) {
    return record ? new Expense(record) : null;
  }

  static fromRecords(records) {
    return records.map((record) => new Expense(record));
  }
}