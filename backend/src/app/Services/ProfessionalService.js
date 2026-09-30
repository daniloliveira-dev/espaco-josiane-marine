import { fail } from "../../domain.js";

export class ProfessionalService {
  constructor({ repository, transaction }) {
    this.repository = repository;
    this.transaction = transaction;
  }

  list(user) {
    return this.repository.list(user.role === "admin");
  }

  save(input, id) {
    return this.transaction(async () => {
      for (const serviceId of input.service_ids)
        if (!(await this.repository.serviceExists(serviceId)))
          fail("Serviço inválido");
      if (id) {
        const result = await this.repository.update(input, id);
        if (!result.changes) fail("Profissional não encontrado", 404);
        await this.repository.removeSkills(id);
      } else {
        id = await this.repository.create(input);
      }
      for (const serviceId of new Set(input.service_ids))
        await this.repository.assignService(id, serviceId);
      return { id, ...input };
    });
  }
}