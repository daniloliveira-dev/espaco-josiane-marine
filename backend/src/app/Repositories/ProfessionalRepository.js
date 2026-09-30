import { Professional } from "../Models/Professional.js";

export class ProfessionalRepository {
  constructor(queries) {
    this.queries = queries;
  }

  async list(includeInactive) {
    const records = await this.queries.listProfessionals(includeInactive);
    return Promise.all(
      records.map(async (record) => {
        const professional = new Professional(record);
        professional.service_ids = (
          await this.queries.listProfessionalServiceIds(record.id)
        ).map((skill) => skill.service_id);
        return professional;
      }),
    );
  }

  serviceExists(id) {
    return this.queries.serviceExists(id);
  }

  update(input, id) {
    return this.queries.updateProfessional(input, id);
  }

  removeSkills(id) {
    return this.queries.deleteProfessionalSkills(id);
  }

  async create(input) {
    const result = await this.queries.createProfessional(input);
    return Number(result.lastInsertRowid);
  }

  assignService(professionalId, serviceId) {
    return this.queries.createSkill(professionalId, serviceId);
  }
}
