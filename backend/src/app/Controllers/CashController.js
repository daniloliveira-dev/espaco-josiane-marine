export class CashController {
  constructor(service) { this.service = service; }

  async list(res) { return res.json(await this.service.list()); }
  async open(res, user, initial) { return res.status(201).json(await this.service.open(user, initial)); }
  async close(res, user, date) { return res.json(await this.service.close(user, date)); }
  async reconcile(res, user, date, counted) { return res.json(await this.service.reconcile(user, date, counted)); }
}