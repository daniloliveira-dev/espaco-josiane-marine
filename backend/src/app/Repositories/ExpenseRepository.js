import { Expense } from "../Models/Expense.js";

export class ExpenseRepository {
  constructor(queries) {
    this.queries = queries;
  }

  async list() {
    return Expense.fromRecords(await this.queries.listExpenses());
  }

  async create(input) {
    const result = await this.queries.createExpense(input);
    return { id: Number(result.lastInsertRowid), ...input };
  }

  isCashOpen(date) {
    return this.queries.isCashOpen(date);
  }
}