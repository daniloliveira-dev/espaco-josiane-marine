import { fail } from "../../../domain.js";
import { toAuthenticatedUser } from "../../DTO/UserDTO.js";

export class RegisterUserUseCase {
  constructor({ users, hash, sessions, transaction }) {
    Object.assign(this, { users, hash, sessions, transaction });
  }

  async execute(input) {
    const email = input.email.toLowerCase();
    return this.transaction(async () => {
      if (await this.users.findByEmail(email)) fail("E-mail já cadastrado", 409);
      const user = await this.users.create({
        ...input,
        email,
        password: this.hash(input.password),
      });
      return this.sessions.create(user);
    });
  }
}

export class LoginUserUseCase {
  constructor({ users, verify, sessions }) {
    Object.assign(this, { users, verify, sessions });
  }

  async execute({ email, password }) {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user || !this.verify(password, user.password))
      fail("E-mail ou senha inválidos", 401);
    return this.sessions.create(user);
  }
}

export class AuthenticateUserUseCase {
  constructor({ users, sessions }) {
    Object.assign(this, { users, sessions });
  }

  async execute(token) {
    const payload = this.sessions.verify(token);
    const user = await this.users.findById(Number(payload.sub));
    if (
      !user ||
      payload.version !== this.sessions.passwordVersion(user.password)
    )
      fail("Sessão inválida", 401);
    return toAuthenticatedUser(user);
  }
}

export class UpdateUserProfileUseCase {
  constructor(users) {
    this.users = users;
  }

  async execute(user, input) {
    await this.users.updateProfile(user.id, input);
    return { ...user, ...input };
  }
}

export class ListClientsUseCase {
  constructor(users) {
    this.users = users;
  }

  execute() {
    return this.users.listClients();
  }
}

export class ListNotificationsUseCase {
  constructor(notifications) {
    this.notifications = notifications;
  }

  execute(userId) {
    return this.notifications.listForUser(userId);
  }
}

export class ListAuditEntriesUseCase {
  constructor(audit) {
    this.audit = audit;
  }

  execute() {
    return this.audit.list();
  }
}