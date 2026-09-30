import { transaction } from "./db.js";
import { closeDue } from "./domain.js";
import { hash, verify } from "./auth.js";
import { AuditRepository } from "./app/Repositories/AuditRepository.js";
import { NotificationRepository } from "./app/Repositories/NotificationRepository.js";
import { UserRepository } from "./app/Repositories/UserRepository.js";
import { AppointmentRepository } from "./app/Repositories/AppointmentRepository.js";
import { PaymentRepository } from "./app/Repositories/PaymentRepository.js";
import { SchedulingRepository } from "./app/Repositories/SchedulingRepository.js";
import { QueryRepository } from "./app/Repositories/QueryRepository.js";
import { ServiceRepository } from "./app/Repositories/ServiceRepository.js";
import { ProfessionalRepository } from "./app/Repositories/ProfessionalRepository.js";
import { ClientRepository } from "./app/Repositories/ClientRepository.js";
import { CashRepository } from "./app/Repositories/CashRepository.js";
import { ExpenseRepository } from "./app/Repositories/ExpenseRepository.js";
import { SchedulingService } from "./app/Services/SchedulingService.js";
import { AuditService } from "./app/Services/AuditService.js";
import { NotificationService } from "./app/Services/NotificationService.js";
import { SessionService } from "./app/Services/SessionService.js";
import { AppointmentService } from "./app/Services/AppointmentService.js";
import { ServiceService } from "./app/Services/ServiceService.js";
import { ProfessionalService } from "./app/Services/ProfessionalService.js";
import { ClientService } from "./app/Services/ClientService.js";
import { CashService } from "./app/Services/CashService.js";
import { ExpenseService } from "./app/Services/ExpenseService.js";
import {
  AuthenticateUserUseCase,
  ListAuditEntriesUseCase,
  ListClientsUseCase,
  ListNotificationsUseCase,
  LoginUserUseCase,
  RegisterUserUseCase,
  UpdateUserProfileUseCase,
} from "./app/UseCases/User/UserUseCases.js";
import {
  CancelAppointmentUseCase,
  CreateAppointmentUseCase,
  RescheduleAppointmentUseCase,
} from "./app/UseCases/Appointment/AppointmentUseCases.js";
import { RecordPaymentUseCase } from "./app/UseCases/Payment/RecordPaymentUseCase.js";
import { UserController } from "./app/Controllers/UserController.js";
import { AppointmentController } from "./app/Controllers/AppointmentController.js";
import { PaymentController } from "./app/Controllers/PaymentController.js";
import { ServiceController } from "./app/Controllers/ServiceController.js";
import { ProfessionalController } from "./app/Controllers/ProfessionalController.js";
import { ClientController } from "./app/Controllers/ClientController.js";
import { CashController } from "./app/Controllers/CashController.js";
import { ExpenseController } from "./app/Controllers/ExpenseController.js";

export function createContainer(db, secret) {
  const queries = new QueryRepository(db);
  const repositories = {
    audit: new AuditRepository(queries),
    appointments: new AppointmentRepository(queries),
    notifications: new NotificationRepository(queries),
    payments: new PaymentRepository(queries),
    scheduling: new SchedulingRepository(queries),
    users: new UserRepository(queries),
    services: new ServiceRepository(queries),
    professionals: new ProfessionalRepository(queries),
    clients: new ClientRepository(queries),
    cash: new CashRepository(queries),
    expenses: new ExpenseRepository(queries),
    queries,
  };
  const auditService = new AuditService(repositories.audit);
  const notificationService = new NotificationService(repositories.notifications);
  const schedulingService = new SchedulingService(repositories.scheduling);
  const services = {
    audit: auditService,
    notifications: notificationService,
    scheduling: schedulingService,
    sessions: new SessionService(secret),
    appointments: new AppointmentService({
      repository: repositories.appointments,
      scheduling: schedulingService,
      queries,
      transaction: (work) => transaction(db, work),
      audit: auditService,
    }),
    serviceCatalog: new ServiceService({
      repository: repositories.services,
      audit: auditService,
    }),
    professionals: new ProfessionalService({
      repository: repositories.professionals,
      transaction: (work) => transaction(db, work),
    }),
    clients: new ClientService(repositories.clients),
    cash: new CashService({
      repository: repositories.cash,
      queries,
      transaction: (work) => transaction(db, work),
      audit: auditService,
      closeDue,
    }),
    expenses: new ExpenseService({
      repository: repositories.expenses,
      audit: auditService,
    }),
  };
  const useCases = {
    authenticateUser: new AuthenticateUserUseCase({
      users: repositories.users,
      sessions: services.sessions,
    }),
    cancelAppointment: new CancelAppointmentUseCase({
      appointments: repositories.appointments,
      transaction: (work) => transaction(db, work),
      audit: services.audit,
      notifications: services.notifications,
    }),
    createAppointment: new CreateAppointmentUseCase({
      appointments: repositories.appointments,
      scheduling: services.scheduling,
      transaction: (work) => transaction(db, work),
      audit: services.audit,
      notifications: services.notifications,
    }),
    listAuditEntries: new ListAuditEntriesUseCase(repositories.audit),
    listClients: new ListClientsUseCase(repositories.users),
    listNotifications: new ListNotificationsUseCase(services.notifications),
    loginUser: new LoginUserUseCase({
      users: repositories.users,
      verify,
      sessions: services.sessions,
    }),
    registerUser: new RegisterUserUseCase({
      users: repositories.users,
      hash,
      sessions: services.sessions,
      transaction: (work) => transaction(db, work),
    }),
    recordPayment: new RecordPaymentUseCase({
      payments: repositories.payments,
      transaction: (work) => transaction(db, work),
      audit: services.audit,
    }),
    rescheduleAppointment: new RescheduleAppointmentUseCase({
      appointments: repositories.appointments,
      scheduling: services.scheduling,
      transaction: (work) => transaction(db, work),
      audit: services.audit,
      notifications: services.notifications,
    }),
    updateUserProfile: new UpdateUserProfileUseCase(repositories.users),
  };
  const controllers = {
    appointments: new AppointmentController({
      appointmentUseCases: useCases,
      appointmentService: services.appointments,
    }),
    payments: new PaymentController(useCases),
    users: new UserController(useCases),
    services: new ServiceController(services.serviceCatalog),
    professionals: new ProfessionalController(services.professionals),
    clients: new ClientController(services.clients),
    cash: new CashController(services.cash),
    expenses: new ExpenseController(services.expenses),
  };
  return { repositories, services, useCases, controllers };
}