import { registerPush } from "../push";
import React, { useState, useEffect } from "react";
import { router } from "expo-router";
import { useAuth } from "../core";
import {
  Screen,
  Card,
  Title,
  Muted,
  Field,
  Button,
  Notice,
} from "../components/ui";
export default function Profile() {
  const { session, setSession, api } = useAuth();
  const [name, setName] = useState(session?.user.name || ""),
    [phone, setPhone] = useState(session?.user.phone || ""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [notifications, setNotifications] = useState<any[]>([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api.users.notifications()
      .then(setNotifications)
      .catch((e) => setError(e.message));
  }, [api]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const user = await api.users.updateProfile({ name, phone });
      if (session) await setSession({ ...session, user });
      setMessage("Perfil atualizado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Meu perfil" subtitle="Seus dados e avisos do salão.">
      <Notice message={error} error />
      <Notice message={message} />
      <Card>
        <Title>
          {session?.user.role === "admin" ? "Administrador" : "Cliente"}
        </Title>
        <Muted>{session?.user.email}</Muted>
        <Field label="Nome" value={name} onChangeText={setName} />
        <Field
          label="Telefone / WhatsApp"
          value={phone}
          onChangeText={setPhone}
        />
        <Button title="Salvar perfil" disabled={busy} onPress={save} />
        <Button
          secondary
          title="Sair da conta"
          onPress={async () => {
            try {
              await api.push.unregister();
            } catch {}
            await setSession(null);
            router.replace("/");
          }}
        />
      </Card>
      <Card>
        <Title>Notificações</Title>
        <Button
          secondary
          title="Ativar notificações no aparelho"
          onPress={async () => {
            try {
              const token = await registerPush();
              await api.push.register(token, true);
              setMessage("Notificações ativadas.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
        <Button
          secondary
          title="Desativar notificações"
          onPress={async () => {
            try {
              await api.push.unregister();
              setMessage("Notificações push desativadas.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />

        {notifications.length ? (
          notifications.map((n) => (
            <Muted key={n.id}>
              {n.title} · {new Date(n.created_at).toLocaleDateString("pt-BR")}
            </Muted>
          ))
        ) : (
          <Muted>Nenhum aviso por enquanto.</Muted>
        )}
      </Card>
    </Screen>
  );
}
