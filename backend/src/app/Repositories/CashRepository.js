import { CashDay } from "../Models/CashDay.js";

export class CashRepository {
  constructor(queries) {
    this.queries = queries;
  }

  async list() {
    return CashDay.fromRecords(await this.queries.listCashDays());
  }

  exists(date) {
    return this.queries.cashDayExists(date);
  }

  open(date, initial) {
    return this.queries.createCashDay(date, initial);
  }

  find(date) {
    return this.queries.findCashDay(date).then(CashDay.fromRecord);
  }

  close(expected, closedAt, date) {
    return this.queries.closeCashDayManually(expected, closedAt, date);
  }

  reconcile(counted, date) {
    return this.queries.reconcileCashDay(counted, date);
  }
}