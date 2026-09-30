import React, { useState, useCallback } from "react";
import { Text, View, Alert, Platform } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth, brl, displayDate, today, cents } from "../core";
import type { PaymentMethod } from "../services/api";
import {
  Screen,
  Card,
  Title,
  Muted,
  Button,
  Field,
  Chips,
  Notice,
  s,
} from "../components/ui";
const labels: Record<string, string> = {
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  nao_compareceu: "Não compareceu",
};
export default function Appointments() {
  const { api, session } = useAuth();
  const admin = session?.user.role === "admin";
  const [rows, setRows] = useState<any[]>([]),
    [date, setDate] = useState(admin ? today() : ""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(0),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState<PaymentMethod>("pix"),
    [newDate, setNewDate] = useState(""),
    [newSlot, setNewSlot] = useState(""),
    [slots, setSlots] = useState<any[]>([]);
  const load = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      setRows(await api.appointments.list(date || undefined));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [date, session, api]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  async function act(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      setMessage("Agendamento atualizado.");
      setSelected(0);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function cancel(id: number) {
    if (Platform.OS === "web") {
      if (window.confirm("Cancelar este agendamento?"))
        act(() => api.appointments.cancel(id));
    } else
      Alert.alert(
        "Cancelar agendamento",
        "O horário será liberado para outras pessoas.",
        [
          { text: "Voltar", style: "cancel" },
          {
            text: "Cancelar horário",
            style: "destructive",
            onPress: () => act(() => api.appointments.cancel(id)),
          },
        ],
      );
  }
  async function pay(a: any) {
    setBusy(true);
    setError("");
    try {
      await api.payments.create({
        appointment_id: a.id,
        amount: cents(amount),
        method,
        request_key: `payment-${a.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      setAmount("");
      setSelected(0);
      setMessage("Pagamento registrado.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function available(a: any) {
    setBusy(true);
    try {
      setSlots(
        await api.availability({
          service_id: a.service_id,
          professional_id: a.professional_id,
          date: newDate,
        }),
      );
      setNewSlot("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title={admin ? "Agenda do salão" : "Meus horários"}
      subtitle={
        admin
          ? "Organize os atendimentos e registre os recebimentos."
          : "Seus próximos momentos de cuidado."
      }
      busy={busy}
    >
      <Notice error message={error} />
      <Notice message={message} />
      {admin && (
        <Card>
          <Field
            label="Filtrar data (AAAA-MM-DD; vazio = todas)"
            value={date}
            onChangeText={setDate}
          />
          <Button secondary title="Atualizar agenda" onPress={load} />
        </Card>
      )}
      {!rows.length && !busy && (
        <Card>
          <Title>Nenhum agendamento</Title>
          <Muted>Seus horários aparecerão aqui após a reserva.</Muted>
        </Card>
      )}
      {rows.map((a) => (
        <Card key={a.id}>
          <View style={s.row}>
            <Text style={s.badge}>{labels[a.status] || a.status}</Text>
            <Text style={s.muted}>#{a.id}</Text>
          </View>
          <Title>{a.service_name}</Title>
          <Text style={{ color: "#f5eff2", fontSize: 21 }}>
            {displayDate(a.start)}
          </Text>
          <Muted>
            {a.professional}
            {admin ? ` · ${a.client}` : ""}
          </Muted>
          <View style={s.row}>
            <Text style={s.title}>{brl(a.price)}</Text>
            <Muted>
              {a.paid >= a.price ? "Pago" : `Pendente ${brl(a.price - a.paid)}`}
            </Muted>
          </View>
          {a.notes && <Muted>{a.notes}</Muted>}
          {admin && (
            <Button
              secondary
              title="Abrir comanda / estornos"
              onPress={() =>
                router.push({
                  pathname: "/order",
                  params: { id: String(a.id) },
                })
              }
            />
          )}
          {["confirmado", "aguardando_confirmacao"].includes(a.status) && (
            <View style={{ gap: 8 }}>
              <Button
                secondary
                title="Reagendar"
                onPress={() => {
                  setSelected(selected === a.id ? 0 : a.id);
                  setNewDate(today());
                  setSlots([]);
                }}
              />
              <Button
                secondary
                title="Cancelar horário"
                onPress={() => cancel(a.id)}
              />
            </View>
          )}
          {admin && a.status === "confirmado" && (
            <>
              <Button
                title="Iniciar atendimento"
                onPress={() =>
                  act(() => api.appointments.updateStatus(a.id, "em_atendimento"))
                }
              />
              <Button
                secondary
                title="Marcar ausência"
                onPress={() =>
                  act(() => api.appointments.updateStatus(a.id, "nao_compareceu"))
                }
              />
            </>
          )}
          {admin && a.status === "em_atendimento" && (
            <Button
              title="Concluir atendimento"
              onPress={() =>
                act(() => api.appointments.updateStatus(a.id, "concluido"))
              }
            />
          )}{" "}
          {admin &&
            !["cancelado", "nao_compareceu"].includes(a.status) &&
            a.paid < a.price && (
              <Button
                secondary
                title="Registrar pagamento / sinal"
                onPress={() => {
                  setSelected(a.id);
                  setAmount(((a.price - a.paid) / 100).toFixed(2));
                  setSlots([]);
                }}
              />
            )}
          {selected === a.id && (
            <View style={{ gap: 12 }}>
              {admin && (
                <>
                  <Field
                    label="Valor recebido (R$)"
                    value={amount}
                    onChangeText={setAmount}
                    numeric
                  />
                  <Chips
                    items={["pix", "dinheiro", "debito", "credito"].map(
                      (x) => ({ id: x, label: x }),
                    )}
                    value={method}
                    onSelect={setMethod}
                  />
                  <Button
                    title="Confirmar recebimento"
                    disabled={busy || !amount}
                    onPress={() => pay(a)}
                  />
                </>
              )}
              {["confirmado", "aguardando_confirmacao"].includes(a.status) && (
                <>
                  <Field
                    label="Nova data (AAAA-MM-DD)"
                    value={newDate}
                    onChangeText={setNewDate}
                  />
                  <Button
                    secondary
                    title="Buscar novos horários"
                    onPress={() => available(a)}
                  />
                  <Chips
                    items={slots.map((x) => ({ id: x.start, label: x.label }))}
                    value={newSlot}
                    onSelect={setNewSlot}
                  />
                  <Button
                    title="Confirmar novo horário"
                    disabled={!newSlot || busy}
                    onPress={() =>
                      act(() => api.appointments.reschedule(a.id, newSlot))
                    }
                  />
                </>
              )}
            </View>
          )}
        </Card>
      ))}
    </Screen>
  );
}
