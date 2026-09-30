export class ClientController {
  constructor(service) { this.service = service; }

  async list(res) { return res.json(await this.service.list()); }
}