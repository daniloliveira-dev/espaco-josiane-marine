import { enqueue } from "../../jobs.js";

export class NotificationRepository {
  constructor(queryRepository) {
    this.queries = queryRepository;
  }

  enqueue(userId, title) {
    return enqueue(this.queries, userId, title);
  }

  listForUser(userId) {
    return this.queries.listUserNotifications(userId);
  }
}