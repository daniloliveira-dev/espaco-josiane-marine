import React, { useState } from "react";
import { router } from "expo-router";
import { useAuth } from "../core";
import { Screen, Card, Title, Field, Button, Notice } from "../components/ui";
export default function Recovery() {
  const { api } = useAuth();
  const [email, setEmail] = useState(""),
    [token, setToken] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(operation: () => Promise<any>) {
    setBusy(true);
    setError("");
    try {
      const r = await operation();
      setMessage(r.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Recuperar senha">
      <Notice error message={error} />
      <Notice message={message} />
      <Card>
        <Title>Receber código</Title>
        <Field
          label="E-mail cadastrado"
          value={email}
          onChangeText={setEmail}
        />
        <Button
          title="Enviar código por e-mail"
          disabled={busy}
          onPress={() => act(() => api.auth.forgotPassword(email))}
        />
      </Card>
      <Card>
        <Title>Redefinir senha</Title>
        <Field
          label="Código recebido por e-mail"
          value={token}
          onChangeText={setToken}
        />
        <Field
          label="Nova senha (mínimo 10 caracteres)"
          value={password}
          onChangeText={setPassword}
          secure
        />
        <Button
          title="Salvar nova senha"
          disabled={busy}
          onPress={() => act(() => api.auth.resetPassword(token, password))}
        />
        <Button
          secondary
          title="Voltar ao login"
          onPress={() => router.replace("/")}
        />
      </Card>
    </Screen>
  );
}
