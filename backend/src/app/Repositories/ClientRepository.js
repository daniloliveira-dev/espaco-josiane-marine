import { Client } from "../Models/Client.js";

export class ClientRepository {
  constructor(queries) {
    this.queries = queries;
  }

  async list() {
    return Client.fromRecords(await this.queries.listClientUsers());
  }
}