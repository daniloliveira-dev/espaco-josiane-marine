export class NotificationService {
  constructor(notificationRepository) {
    this.notificationRepository = notificationRepository;
  }

  notify(userId, title) {
    return this.notificationRepository.enqueue(userId, title);
  }

  listForUser(userId) {
    return this.notificationRepository.listForUser(userId);
  }
}