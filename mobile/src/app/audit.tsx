import React, { useCallback, useState } from "react";
import { Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../core";
import { Screen, Card, Title, Muted, Notice, s } from "../components/ui";

type AuditEntry = {
  id: number;
  user_id: number | null;
  action: string;
  entity_id: number | null;
  created_at: string;
};

export default function Audit() {
  const { api, session } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (session?.user.role !== "admin") return;
    setBusy(true);
    setError("");
    try {
      setEntries(await api.users.audit());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [api, session?.user.role]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen admin title="Auditoria" subtitle="Atividades recentes do salão." busy={busy}>
      <Notice error message={error} />
      {!entries.length && !busy && (
        <Card>
          <Muted>Nenhuma atividade registrada.</Muted>
        </Card>
      )}
      {entries.map((entry) => (
        <Card key={entry.id}>
          <Text style={s.badge}>{entry.action.replaceAll("_", " ")}</Text>
          <Title>{entry.entity_id ? `Registro #${entry.entity_id}` : "Atividade administrativa"}</Title>
          <Muted>
            {new Date(entry.created_at).toLocaleString("pt-BR")} · usuário #{entry.user_id ?? "sistema"}
          </Muted>
        </Card>
      ))}
    </Screen>
  );
}
