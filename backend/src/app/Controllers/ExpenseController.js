export class ExpenseController {
  constructor(service) { this.service = service; }

  async list(res) { return res.json(await this.service.list()); }
  async create(res, user, input) { return res.status(201).json(await this.service.create(user, input)); }
}