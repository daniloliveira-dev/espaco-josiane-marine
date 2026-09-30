export class ServiceController {
  constructor(service) {
    this.service = service;
  }

  async list(res, user) { return res.json(await this.service.list(user)); }
  async create(res, user, input) { return res.status(201).json(await this.service.create(user, input)); }
  async update(res, user, id, input) { return res.json(await this.service.update(user, id, input)); }
}