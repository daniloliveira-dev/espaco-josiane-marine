import { User } from "../Models/User.js";

export class UserRepository {
  constructor(queryRepository) {
    this.queries = queryRepository;
  }

  async findByEmail(email) {
    return User.fromRecord(await this.queries.findUserByEmail(email));
  }

  async findById(id) {
    return User.fromRecord(await this.queries.findUserById(id));
  }

  async create(input) {
    const result = await this.queries.createUser(input);
    return this.findById(Number(result.lastInsertRowid));
  }

  updateProfile(id, input) {
    return this.queries.updateUserProfile(id, input);
  }

  listClients() {
    return this.queries.listClientUsers();
  }
}