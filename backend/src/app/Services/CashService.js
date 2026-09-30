import { fail, localDate, now, report } from "../../domain.js";

export class CashService {
  constructor({ repository, queries, transaction, audit, closeDue }) {
    Object.assign(this, { repository, queries, transaction, audit, closeDue });
  }

  async list() {
    await this.closeDue(this.queries);
    return this.repository.list();
  }

  async open(user, initial) {
    const date = localDate();
    if (await this.repository.exists(date)) fail("Caixa do dia já existente", 409);
    await this.repository.open(date, initial);
    await this.audit.record(user, "abertura_caixa");
    return { date, initial };
  }

  async close(user, date) {
    return this.transaction(async () => {
      const cash = await this.repository.find(date);
      if (!cash || cash.status !== "aberto") fail("Caixa não está aberto");
      const result = await report(this.queries, date, date);
      const expenses = await this.queries.cashExpenseTotal(date);
      const expected = cash.initial + result.byMethod.dinheiro - expenses.total;
      await this.repository.close(expected, now(), date);
      await this.audit.record(user, "fechamento_caixa");
      return { success: true };
    });
  }

  async reconcile(user, date, counted) {
    const result = await this.repository.reconcile(counted, date);
    if (!result.changes) fail("Caixa não disponível para conferência");
    await this.audit.record(user, "conferencia_caixa");
    return { success: true };
  }
}