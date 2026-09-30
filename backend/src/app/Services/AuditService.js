export class AuditService {
  constructor(auditRepository) {
    this.auditRepository = auditRepository;
  }

  record(user, action, entityId) {
    return this.auditRepository.record(user, action, entityId);
  }
}