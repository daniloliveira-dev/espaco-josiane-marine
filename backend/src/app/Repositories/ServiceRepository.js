import { Service } from "../Models/Service.js";

export class ServiceRepository {
  constructor(queries) {
    this.queries = queries;
  }

  async list(includeInactive) {
    return Service.fromRecords(await this.queries.listServices(includeInactive));
  }

  async create(input) {
    const result = await this.queries.createService(input);
    return { id: Number(result.lastInsertRowid), ...input };
  }

  async update(input, id) {
    const result = await this.queries.updateService(input, id);
    return result.changes ? { id, ...input } : null;
  }
}