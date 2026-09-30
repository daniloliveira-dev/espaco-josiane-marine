export class Client {
  constructor(record) {
    const { password, ...client } = record;
    Object.assign(this, client);
  }

  static fromRecord(record) {
    return record ? new Client(record) : null;
  }

  static fromRecords(records) {
    return records.map((record) => new Client(record));
  }
}