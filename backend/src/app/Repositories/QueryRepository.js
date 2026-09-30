// Operational SQL lives here; callers use domain-specific methods rather than SQL strings.
export class QueryRepository {
  constructor(db) {
    this.db = db;
  }

  async existsUserByEmail(email) {
    return Boolean(await this.db.prepare("SELECT 1 FROM users WHERE email=?").get(email));
  }
  countUsers() { return this.db.prepare("SELECT COUNT(*) n FROM users").get(); }
  ensureSettingsRow() { return this.db.prepare("INSERT INTO settings(id) VALUES(1) ON DUPLICATE KEY UPDATE id=VALUES(id)").run(); }
  async resetIntegrationFixtures() {
    const tables = [
      "push_queue", "push_devices", "monthly_reports", "job_keys", "waitlist",
      "password_resets", "refunds", "commissions", "commission_rules",
      "order_adjustments", "appointment_items", "notifications", "audit",
      "cash_days", "expenses", "payments", "appointments", "blocks", "skills",
      "products", "professionals", "services", "users",
    ];
    await this.db.pool.query("SET FOREIGN_KEY_CHECKS=0");
    for (const table of tables)
      await this.db.prepare(`TRUNCATE TABLE \`${table}\``).run();
    await this.db.pool.query("SET FOREIGN_KEY_CHECKS=1");
  }
  configureIntegrationSettings() { return this.db.prepare("UPDATE settings SET days='[0,1,2,3,4,5,6]',close_time='23:59'").run(); }
  insertAdmin({ name, email, password }) {
    return this.db.prepare("INSERT INTO users(name,email,password,role) VALUES(?,?,?,'admin')").run(name, email, password);
  }
  insertDemoAdmin(password) {
    return this.db.prepare("INSERT INTO users(name,email,password,role) VALUES('Josiane','admin@demo.local',?,'admin')").run(password);
  }
  insertDemoClient(password) {
    return this.db.prepare("INSERT INTO users(name,email,phone,password) VALUES('Marina','cliente@demo.local','31999990000',?)").run(password);
  }
  seedDemoServices() { return this.db.prepare("INSERT INTO services(name,description,price,duration) VALUES('Corte e finalização','Um novo olhar para o seu estilo.',9000,60),('Manicure','Cuidado até nos pequenos detalhes.',4500,45),('Design de sobrancelhas','Realce sua expressão.',4000,30)").run(); }
  seedDemoProfessionals() { return this.db.prepare("INSERT INTO professionals(name) VALUES('Josiane Marine'),('Camila')").run(); }
  seedDemoSkills() { return this.db.prepare("INSERT INTO skills VALUES(1,1),(1,3),(2,2)").run(); }
  seedDemoProducts() { return this.db.prepare("INSERT INTO products(name,price,stock) VALUES('Shampoo profissional',6500,8)").run(); }
  seedDemoCommissionRules() { return this.db.prepare("INSERT INTO commission_rules VALUES(1,20),(2,20),(3,20)").run(); }

  reportAppointments(start, end) {
    return this.db.prepare("SELECT a.*,u.name client,p.name professional FROM appointments a JOIN users u ON u.id=a.user_id JOIN professionals p ON p.id=a.professional_id WHERE a.start>=? AND a.start<?").all(start, end);
  }
  reportPayments(start, end) { return this.db.prepare("SELECT * FROM payments WHERE created_at>=? AND created_at<?").all(start, end); }
  reportRefunds(start, end) { return this.db.prepare("SELECT r.*,p.method FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.created_at>=? AND r.created_at<?").all(start, end); }
  reportExpenses(from, to) { return this.db.prepare("SELECT * FROM expenses WHERE date BETWEEN ? AND ?").all(from, to); }
  paidTotal(appointmentId) { return this.db.prepare("SELECT COALESCE(SUM(amount),0) total FROM payments WHERE appointment_id=?").get(appointmentId); }
  refundedTotalForAppointment(appointmentId) { return this.db.prepare("SELECT COALESCE(SUM(r.amount),0) total FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=?").get(appointmentId); }
  reportCommissionTotal(start, end) { return this.db.prepare("SELECT COALESCE(SUM(c.amount),0) total FROM commissions c JOIN appointments a ON a.id=c.appointment_id WHERE a.start>=? AND a.start<?").get(start, end); }
  getSettings() { return this.db.prepare("SELECT * FROM settings").get(); }
  openCashDays() { return this.db.prepare("SELECT * FROM cash_days WHERE status='aberto'").all(); }
  cashExpenseTotal(date) { return this.db.prepare("SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE date=? AND method='dinheiro'").get(date); }
  closeCashDay(expected, closedAt, date) { return this.db.prepare("UPDATE cash_days SET expected=?,status='aguardando_conferencia',closed_at=? WHERE date=? AND status='aberto'").run(expected, closedAt, date); }

  listExpenses() { return this.db.prepare("SELECT * FROM expenses ORDER BY date DESC LIMIT 500").all(); }
  isCashOpen(date) { return this.db.prepare("SELECT 1 FROM cash_days WHERE date=? AND status='aberto'").get(date); }
  createExpense({ description, amount, method, date }) { return this.db.prepare("INSERT INTO expenses(description,amount,method,date) VALUES(?,?,?,?)").run(description, amount, method, date); }
  listCashDays() { return this.db.prepare("SELECT * FROM cash_days ORDER BY date DESC LIMIT 90").all(); }
  cashDayExists(date) { return this.db.prepare("SELECT 1 FROM cash_days WHERE date=?").get(date); }
  createCashDay(date, initial) { return this.db.prepare("INSERT INTO cash_days(date,initial) VALUES(?,?)").run(date, initial); }
  findCashDay(date) { return this.db.prepare("SELECT * FROM cash_days WHERE date=?").get(date); }
  closeCashDayManually(expected, closedAt, date) { return this.db.prepare("UPDATE cash_days SET expected=?,status='aguardando_conferencia',closed_at=? WHERE date=?").run(expected, closedAt, date); }
  reconcileCashDay(counted, date) { return this.db.prepare("UPDATE cash_days SET counted=?,status='conferido' WHERE date=? AND status='aguardando_conferencia'").run(counted, date); }

  listServices(admin) { return this.db.prepare(`SELECT * FROM services ${admin ? "" : "WHERE active=1"} ORDER BY name`).all(); }
  createService(service) { return this.db.prepare("INSERT INTO services(name,description,price,duration,buffer,active) VALUES(?,?,?,?,?,?)").run(service.name, service.description, service.price, service.duration, service.buffer, service.active); }
  updateService(service, id) { return this.db.prepare("UPDATE services SET name=?,description=?,price=?,duration=?,buffer=?,active=? WHERE id=?").run(service.name, service.description, service.price, service.duration, service.buffer, service.active, id); }
  listProfessionals(admin) { return this.db.prepare(`SELECT * FROM professionals ${admin ? "" : "WHERE active=1"} ORDER BY name`).all(); }
  listProfessionalServiceIds(id) { return this.db.prepare("SELECT service_id FROM skills WHERE professional_id=?").all(id); }
  serviceExists(id) { return this.db.prepare("SELECT 1 FROM services WHERE id=?").get(id); }
  updateProfessional(input, id) { return this.db.prepare("UPDATE professionals SET name=?,active=? WHERE id=?").run(input.name, input.active, id); }
  deleteProfessionalSkills(id) { return this.db.prepare("DELETE FROM skills WHERE professional_id=?").run(id); }
  createProfessional(input) { return this.db.prepare("INSERT INTO professionals(name,active) VALUES(?,?)").run(input.name, input.active); }
  createSkill(professionalId, serviceId) { return this.db.prepare("INSERT INTO skills VALUES(?,?)").run(professionalId, serviceId); }
  updateSettings(input) { return this.db.prepare("UPDATE settings SET open_hour=?,close_hour=?,close_time=?,days=?,cancel_hours=?").run(input.open_hour, input.close_hour, input.close_time, input.days, input.cancel_hours); }
  listBlocks() { return this.db.prepare("SELECT * FROM blocks ORDER BY start DESC").all(); }
  overlappingAppointments(professionalId, end, start) { return this.db.prepare("SELECT 1 FROM appointments WHERE (? IS NULL OR professional_id=?) AND status NOT IN ('cancelado','nao_compareceu') AND start<? AND end>?").get(professionalId, professionalId, end, start); }
  createBlock(professionalId, start, end, reason) { return this.db.prepare("INSERT INTO blocks(professional_id,start,end,reason) VALUES(?,?,?,?)").run(professionalId, start, end, reason); }
  deleteBlock(id) { return this.db.prepare("DELETE FROM blocks WHERE id=?").run(id); }

  findAppointment(id) { return this.db.prepare("SELECT * FROM appointments WHERE id=?").get(id); }
  listAppointments({ userId, dateFrom, dateTo }) {
    const clauses = [], params = [];
    if (userId != null) { clauses.push("a.user_id=?"); params.push(userId); }
    if (dateFrom) { clauses.push("a.start>=? AND a.start<?"); params.push(dateFrom, dateTo); }
    const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
    return this.db.prepare("SELECT a.*,u.name client,p.name professional,COALESCE((SELECT SUM(amount) FROM payments WHERE appointment_id=a.id),0)-COALESCE((SELECT SUM(r.amount) FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.appointment_id=a.id),0) paid FROM appointments a JOIN users u ON u.id=a.user_id JOIN professionals p ON p.id=a.professional_id" + where + " ORDER BY a.start DESC LIMIT 500").all(...params);
  }
  updateAppointmentStatus(id, status) { return this.db.prepare("UPDATE appointments SET status=? WHERE id=?").run(status, id); }
  listServiceItems(appointmentId) { return this.db.prepare("SELECT * FROM appointment_items WHERE appointment_id=? AND kind='servico'").all(appointmentId); }
  findOrderAdjustment(appointmentId) { return this.db.prepare("SELECT * FROM order_adjustments WHERE appointment_id=?").get(appointmentId); }
  orderGross(appointmentId) { return this.db.prepare("SELECT COALESCE(SUM(quantity*unit_price),0) total FROM appointment_items WHERE appointment_id=?").get(appointmentId); }
  createCommission(appointmentId, professionalId, amount) { return this.db.prepare("INSERT IGNORE INTO commissions(appointment_id,professional_id,amount) VALUES(?,?,?)").run(appointmentId, professionalId, amount); }

  findUserByEmail(email) { return this.db.prepare("SELECT * FROM users WHERE email=?").get(email); }
  deletePasswordResetsForUser(userId) { return this.db.prepare("DELETE FROM password_resets WHERE user_id=?").run(userId); }
  createPasswordReset(token, userId, expires) { return this.db.prepare("INSERT INTO password_resets VALUES(?,?,?)").run(token, userId, expires); }
  findValidPasswordReset(token, nowValue) { return this.db.prepare("SELECT * FROM password_resets WHERE token=? AND expires>?").get(token, nowValue); }
  updateUserPassword(password, userId) { return this.db.prepare("UPDATE users SET password=? WHERE id=?").run(password, userId); }
  upsertPushDevice(token, userId, enabled) { return this.db.prepare("INSERT INTO push_devices(token,user_id,enabled) VALUES(?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),enabled=VALUES(enabled)").run(token, userId, enabled); }
  deletePushDevicesForUser(userId) { return this.db.prepare("DELETE FROM push_devices WHERE user_id=?").run(userId); }
  listMonthlyReports() { return this.db.prepare("SELECT month,created_at FROM monthly_reports ORDER BY month DESC").all(); }
  findMonthlyReport(month) { return this.db.prepare("SELECT data FROM monthly_reports WHERE month=?").get(month); }
  listProducts() { return this.db.prepare("SELECT * FROM products ORDER BY name").all(); }
  createProduct(input) { return this.db.prepare("INSERT INTO products(name,price,stock,minimum,active) VALUES(?,?,?,?,?)").run(input.name, input.price, input.stock, input.minimum, input.active); }
  updateProduct(input, id) { return this.db.prepare("UPDATE products SET name=?,price=?,stock=?,minimum=?,active=? WHERE id=?").run(input.name, input.price, input.stock, input.minimum, input.active, id); }
  listOrderItems(appointmentId) { return this.db.prepare("SELECT * FROM appointment_items WHERE appointment_id=?").all(appointmentId); }
  listAppointmentPayments(appointmentId) { return this.db.prepare("SELECT * FROM payments WHERE appointment_id=?").all(appointmentId); }
  findActiveProduct(id) { return this.db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(id); }
  changeProductStock(delta, id) { return this.db.prepare("UPDATE products SET stock=stock+? WHERE id=?").run(delta, id); }
  insertProductOrderItem(appointmentId, name, quantity, price, productId) { return this.db.prepare("INSERT INTO appointment_items(appointment_id,kind,name,quantity,unit_price,product_id) VALUES(?,'produto',?,?,?,?)").run(appointmentId, name, quantity, price, productId); }
  findActiveService(id) { return this.db.prepare("SELECT * FROM services WHERE id=? AND active=1").get(id); }
  commissionPercent(serviceId) { return this.db.prepare("SELECT percent FROM commission_rules WHERE service_id=?").get(serviceId); }
  serviceSkillExists(serviceId, professionalId) { return this.db.prepare("SELECT 1 FROM skills WHERE service_id=? AND professional_id=?").get(serviceId, professionalId); }
  updateAppointmentEnd(end, id) { return this.db.prepare("UPDATE appointments SET end=? WHERE id=?").run(end, id); }
  insertServiceOrderItem(appointmentId, name, quantity, price, commission) { return this.db.prepare("INSERT INTO appointment_items(appointment_id,kind,name,quantity,unit_price,commission) VALUES(?,'servico',?,?,?,?)").run(appointmentId, name, quantity, price, commission); }
  updateAppointmentPrice(price, id) { return this.db.prepare("UPDATE appointments SET price=? WHERE id=?").run(price, id); }
  findRemovableProductItem(itemId, appointmentId) { return this.db.prepare("SELECT * FROM appointment_items WHERE id=? AND appointment_id=? AND kind='produto'").get(itemId, appointmentId); }
  deleteOrderItem(id) { return this.db.prepare("DELETE FROM appointment_items WHERE id=?").run(id); }
  upsertOrderAdjustment(appointmentId, discount, extra, reason) { return this.db.prepare("INSERT INTO order_adjustments(appointment_id,discount,extra,reason) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE discount=VALUES(discount),extra=VALUES(extra),reason=VALUES(reason)").run(appointmentId, discount, extra, reason); }
  findRefundByRequestKey(key) { return this.db.prepare("SELECT * FROM refunds WHERE request_key=?").get(key); }
  findPayment(id) { return this.db.prepare("SELECT * FROM payments WHERE id=?").get(id); }
  refundedTotalForPayment(id) { return this.db.prepare("SELECT COALESCE(SUM(amount),0) total FROM refunds WHERE payment_id=?").get(id); }
  createRefund(paymentId, amount, reason, createdAt, key) { return this.db.prepare("INSERT INTO refunds(payment_id,amount,reason,created_at,request_key) VALUES(?,?,?,?,?)").run(paymentId, amount, reason, createdAt, key); }
  listCommissionRules() { return this.db.prepare("SELECT * FROM commission_rules").all(); }
  upsertCommissionRule(serviceId, percent) { return this.db.prepare("INSERT INTO commission_rules VALUES(?,?) ON DUPLICATE KEY UPDATE percent=VALUES(percent)").run(serviceId, percent); }
  listCommissions() { return this.db.prepare("SELECT c.*,p.name professional,a.start FROM commissions c JOIN professionals p ON p.id=c.professional_id JOIN appointments a ON a.id=c.appointment_id ORDER BY a.start DESC").all(); }
  findCommission(appointmentId) { return this.db.prepare("SELECT * FROM commissions WHERE appointment_id=?").get(appointmentId); }
  createWaitlistExpense(description, amount, method, date) { return this.createExpense({ description, amount, method, date }); }
  markCommissionPaid(paidAt, expenseId, appointmentId) { return this.db.prepare("UPDATE commissions SET paid_at=?,expense_id=? WHERE appointment_id=? AND paid_at IS NULL").run(paidAt, expenseId, appointmentId); }
  listWaitlist(userId) { return userId == null ? this.db.prepare("SELECT w.*,u.name client FROM waitlist w JOIN users u ON u.id=w.user_id ORDER BY date").all() : this.db.prepare("SELECT * FROM waitlist WHERE user_id=? ORDER BY date").all(userId); }
  findActiveWaitlistEntry(userId, serviceId, professionalId, date) { return this.db.prepare("SELECT 1 FROM waitlist WHERE user_id=? AND service_id=? AND professional_id=? AND date=? AND status='aguardando'").get(userId, serviceId, professionalId, date); }
  createWaitlistEntry(userId, serviceId, professionalId, date) { return this.db.prepare("INSERT INTO waitlist(user_id,service_id,professional_id,date) VALUES(?,?,?,?)").run(userId, serviceId, professionalId, date); }

  insertJobKey(key) { return this.db.prepare("INSERT IGNORE INTO job_keys(`key`) VALUES(?)").run(key); }
  createNotification(userId, title, createdAt) { return this.db.prepare("INSERT INTO notifications(user_id,title,created_at) VALUES(?,?,?)").run(userId, title, createdAt); }
  listEnabledPushTokens(userId) { return this.db.prepare("SELECT token FROM push_devices WHERE user_id=? AND enabled=1").all(userId); }
  enqueuePush(notificationId, token) { return this.db.prepare("INSERT IGNORE INTO push_queue(notification_id,token) VALUES(?,?)").run(notificationId, token); }
  listAdminUsers() { return this.db.prepare("SELECT id FROM users WHERE role='admin'").all(); }
  listCashDaysForReconciliation() { return this.db.prepare("SELECT date FROM cash_days WHERE status='aguardando_conferencia'").all(); }
  listUpcomingAppointments(start, end) { return this.db.prepare("SELECT * FROM appointments WHERE start>? AND start<=? AND status='confirmado'").all(start, end); }
  saveMonthlyReport(month, data, createdAt) { return this.db.prepare("INSERT IGNORE INTO monthly_reports(month,data,created_at) VALUES(?,?,?)").run(month, data, createdAt); }
  pendingPushBatch(nowValue) { return this.db.prepare("SELECT q.*,n.title FROM push_queue q JOIN notifications n ON n.id=q.notification_id JOIN push_devices d ON d.token=q.token WHERE q.status='pending' AND q.attempts<5 AND q.next_attempt<=? AND d.enabled=1 LIMIT 50").all(nowValue); }
  markPushTicket(ticketId, sentAt, id) { return this.db.prepare("UPDATE push_queue SET status='ticket',ticket_id=?,sent_at=? WHERE id=?").run(ticketId, sentAt, id); }
  markPushFailed(error, id) { return this.db.prepare("UPDATE push_queue SET status='failed',error=? WHERE id=?").run(error, id); }
  disablePushDevice(token) { return this.db.prepare("UPDATE push_devices SET enabled=0 WHERE token=?").run(token); }
  retryPush(nextAttempt, error, id) { return this.db.prepare("UPDATE push_queue SET attempts=attempts+1,next_attempt=?,error=? WHERE id=?").run(nextAttempt, error, id); }
  pendingPushReceipts(before) { return this.db.prepare("SELECT * FROM push_queue WHERE status='ticket' AND sent_at<? LIMIT 100").all(before); }
  updatePushReceipt(status, error, id) { return this.db.prepare("UPDATE push_queue SET status=?,error=? WHERE id=?").run(status, error, id); }

  findUserById(id) { return this.db.prepare("SELECT * FROM users WHERE id=?").get(id); }
  createUser({ name, email, phone, password }) { return this.db.prepare("INSERT INTO users(name,email,phone,password) VALUES(?,?,?,?)").run(name, email, phone, password); }
  updateUserProfile(id, { name, phone }) { return this.db.prepare("UPDATE users SET name=?,phone=? WHERE id=?").run(name, phone, id); }
  listClientUsers() { return this.db.prepare("SELECT id,name,email,phone FROM users WHERE role='cliente' ORDER BY name").all(); }
  recordAudit(user, action, entityId, createdAt) { return this.db.prepare("INSERT INTO audit(user_id,action,entity_id,created_at) VALUES(?,?,?,?)").run(user.id, action, entityId || null, createdAt); }
  listAuditEntries() { return this.db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 200").all(); }
  listUserNotifications(userId) { return this.db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50").all(userId); }
  userExists(userId) { return this.db.prepare("SELECT 1 FROM users WHERE id=?").get(userId); }
  findAppointmentSettings() { return this.getSettings(); }
  appointmentNetPaid(appointmentId) { return Promise.all([this.paidTotal(appointmentId), this.refundedTotalForAppointment(appointmentId)]).then(([paid, refunded]) => paid.total - refunded.total); }
  countPayments() { return this.db.prepare("SELECT COUNT(*) n FROM payments").get(); }
  countRefunds() { return this.db.prepare("SELECT COUNT(*) n FROM refunds").get(); }
  countMonthlyReports() { return this.db.prepare("SELECT COUNT(*) n FROM monthly_reports").get(); }
  countNotifications() { return this.db.prepare("SELECT COUNT(*) n FROM notifications").get(); }
  findBookableService(serviceId) { return this.db.prepare("SELECT * FROM services WHERE id=? AND active=1").get(serviceId); }
  professionalCanPerform(serviceId, professionalId) { return this.db.prepare("SELECT 1 FROM skills JOIN professionals p ON p.id=professional_id WHERE service_id=? AND professional_id=? AND p.active=1").get(serviceId, professionalId); }
  async hasSchedulingConflict(professionalId, start, end, exceptAppointmentId = 0) {
    await this.db.prepare("SELECT id FROM professionals WHERE id=? FOR UPDATE").get(professionalId);
    const appointment = await this.db.prepare("SELECT 1 FROM appointments WHERE professional_id=? AND status NOT IN ('cancelado','nao_compareceu') AND start<? AND end>? AND id<>? FOR UPDATE").get(professionalId, end, start, exceptAppointmentId);
    const block = await this.db.prepare("SELECT 1 FROM blocks WHERE (professional_id=? OR professional_id IS NULL) AND start<? AND end>?").get(professionalId, end, start);
    return Boolean(appointment || block);
  }
  createAppointmentRecord({ userId, serviceId, professionalId, start, end, service, notes }) { return this.db.prepare("INSERT INTO appointments(user_id,service_id,professional_id,start,end,price,service_name,notes) VALUES(?,?,?,?,?,?,?,?)").run(userId, serviceId, professionalId, start, end, service.price, service.name, notes); }
  deleteAdditionalProductItems(appointmentId) { return this.db.prepare("DELETE FROM appointment_items WHERE appointment_id=? AND kind='produto'").run(appointmentId); }
  listAdditionalProductItems(appointmentId) { return this.db.prepare("SELECT * FROM appointment_items WHERE appointment_id=? AND kind='produto'").all(appointmentId); }
  cancelAppointment(id) { return this.db.prepare("UPDATE appointments SET status='cancelado' WHERE id=?").run(id); }
  updateAppointmentWindow(id, start, end) { return this.db.prepare("UPDATE appointments SET start=?,end=? WHERE id=?").run(start, end, id); }
  findPaymentByRequestKey(key) { return this.db.prepare("SELECT * FROM payments WHERE request_key=?").get(key); }
  netPaidForPayment(appointmentId) { return this.appointmentNetPaid(appointmentId); }
  isCashDayOpen(date) { return this.isCashOpen(date); }
  async createPayment(input) {
    const result = await this.db.prepare("INSERT INTO payments(appointment_id,amount,method,created_at,request_key) VALUES(?,?,?,?,?)").run(input.appointmentId, input.amount, input.method, input.createdAt, input.requestKey);
    return this.db.prepare("SELECT * FROM payments WHERE id=?").get(Number(result.lastInsertRowid));
  }
}
