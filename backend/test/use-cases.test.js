import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AuthenticateUserUseCase,
  LoginUserUseCase,
  RegisterUserUseCase,
  UpdateUserProfileUseCase,
} from "../src/app/UseCases/User/UserUseCases.js";

test("RegisterUser normaliza o e-mail, armazena hash e retorna DTO de sessão", async () => {
  let saved;
  const useCase = new RegisterUserUseCase({
    users: {
      findByEmail: () => undefined,
      create: (user) => ((saved = { id: 7, role: "cliente", ...user })),
    },
    hash: (password) => `hashed:${password}`,
    sessions: {
      create: (user) => ({
        user: { id: user.id, name: user.name, email: user.email },
      }),
    },
    transaction: async (work) => work(),
  });

  const result = await useCase.execute({
    name: "Cliente",
    email: "CLIENTE@EXAMPLE.TEST",
    phone: "",
    password: "strong-password",
  });

  assert.equal(saved.email, "cliente@example.test");
  assert.equal(saved.password, "hashed:strong-password");
  assert.deepEqual(result.user, {
    id: 7,
    name: "Cliente",
    email: "cliente@example.test",
  });
});

test("LoginUser normaliza e-mail e rejeita credenciais inválidas", async () => {
  const useCase = new LoginUserUseCase({
    users: {
      findByEmail: (email) =>
        email === "cliente@example.test"
          ? { id: 7, password: "saved-hash" }
          : undefined,
    },
    verify: (password, stored) =>
      password === "correct-password" && stored === "saved-hash",
    sessions: { create: (user) => ({ id: user.id }) },
  });

  assert.deepEqual(
    await useCase.execute({
      email: "CLIENTE@example.test",
      password: "correct-password",
    }),
    { id: 7 },
  );
  await assert.rejects(
    useCase.execute({ email: "cliente@example.test", password: "wrong" }),
    { status: 401 },
  );
});

test("AuthenticateUser não expõe a senha e invalida sessão de outra senha", async () => {
  const user = { id: 7, name: "Cliente", password: "secret-hash" };
  const useCase = new AuthenticateUserUseCase({
    users: { findById: () => user },
    sessions: {
      verify: () => ({ sub: "7", version: "current-version" }),
      passwordVersion: () => "current-version",
    },
  });
  assert.deepEqual(await useCase.execute("valid-token"), {
    id: 7,
    name: "Cliente",
  });

  const invalid = new AuthenticateUserUseCase({
    users: { findById: () => user },
    sessions: {
      verify: () => ({ sub: "7", version: "old-version" }),
      passwordVersion: () => "current-version",
    },
  });
  await assert.rejects(invalid.execute("old-token"), { status: 401 });
});

test("UpdateUserProfile usa repositório e devolve usuário atualizado", async () => {
  let update;
  const useCase = new UpdateUserProfileUseCase({
    updateProfile: (...args) => (update = args),
  });
  const result = await useCase.execute(
    { id: 7, name: "Antigo", role: "cliente" },
    { name: "Novo", phone: "11999999999" },
  );
  assert.deepEqual(update, [7, { name: "Novo", phone: "11999999999" }]);
  assert.deepEqual(result, {
    id: 7,
    name: "Novo",
    role: "cliente",
    phone: "11999999999",
  });
});