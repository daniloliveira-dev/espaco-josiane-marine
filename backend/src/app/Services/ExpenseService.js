import { fail, localDate } from "../../domain.js";

export class ExpenseService {
  constructor({ repository, queries, audit }) {
    Object.assign(this, { repository, queries, audit });
  }

  list() {
    return this.repository.list();
  }

  async create(user, input) {
    if (input.date !== localDate()) fail("Registre o pagamento na data atual");
    if (input.method === "dinheiro" && !(await this.repository.isCashOpen(input.date)))
      fail("Abra o caixa antes de pagar em dinheiro");
    const expense = await this.repository.create(input);
    await this.audit.record(user, "despesa", expense.id);
    return expense;
  }
}