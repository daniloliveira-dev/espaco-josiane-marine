import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { toSessionUser } from "../DTO/UserDTO.js";

export class SessionService {
  constructor(secret) {
    this.secret = secret;
  }

  create(user) {
    return {
      token: jwt.sign(
        {
          sub: String(user.id),
          version: this.passwordVersion(user.password),
        },
        this.secret,
        { expiresIn: "12h" },
      ),
      user: toSessionUser(user),
    };
  }

  verify(token) {
    return jwt.verify(token, this.secret);
  }

  passwordVersion(password) {
    return createHash("sha256").update(password).digest("hex");
  }
}