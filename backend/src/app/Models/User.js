export class User {

  constructor({ id, name, email, phone = "", password, role = "cliente" }) {
    this.id = id;
    this.name = name;
    this.email = email;
    this.phone = phone;
    this.password = password;
    this.role = role;
  }

  static fromRecord(record) {
    return record ? new User(record) : null;
  }
}