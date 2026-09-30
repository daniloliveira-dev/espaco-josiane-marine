import { now } from "../../domain.js";

export class AuditRepository {
  constructor(queryRepository) {
    this.queries = queryRepository;
  }

  record(user, action, entityId) {
    return this.queries.recordAudit(user, action, entityId, now());
  }

  list() {
    return this.queries.listAuditEntries();
  }
}