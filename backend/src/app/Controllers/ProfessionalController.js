export class ProfessionalController {
  constructor(service) { this.service = service; }

  async list(res, user) { return res.json(await this.service.list(user)); }
  async create(res, input) { return res.status(201).json(await this.service.save(input)); }
  async update(res, id, input) { return res.json(await this.service.save(input, id)); }
}