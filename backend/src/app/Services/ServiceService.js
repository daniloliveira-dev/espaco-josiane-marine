import { fail } from "../../domain.js";

export class ServiceService {
  constructor({ repository, audit }) {
    this.repository = repository;
    this.audit = audit;
  }

  list(user) {
    return this.repository.list(user.role === "admin");
  }

  async create(user, input) {
    const service = await this.repository.create(input);
    await this.audit.record(user, "servico_criado", service.id);
    return service;
  }

  async update(user, id, input) {
    const service = await this.repository.update(input, id);
    if (!service) fail("Serviço não encontrado", 404);
    await this.audit.record(user, "servico_alterado", id);
    return service;
  }
}