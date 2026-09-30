import React, { useState, useCallback } from "react";
import { Text } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth, brl, cents, today } from "../core";
import type { PaymentMethod } from "../services/api";
import {
  Screen,
  Card,
  Title,
  Muted,
  Field,
  Chips,
  Button,
  Notice,
  s,
} from "../components/ui";
export default function Cash() {
  const { api, session } = useAuth();
  const [rows, setRows] = useState<any[]>([]),
    [expenses, setExpenses] = useState<any[]>([]),
    [initial, setInitial] = useState("0"),
    [counted, setCounted] = useState(""),
    [description, setDescription] = useState(""),
    [amount, setAmount] = useState(""),
    [method, setMethod] = useState<PaymentMethod>("pix"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (session?.user.role !== "admin") return;
    const [a, b] = await Promise.all([api.cash.list(), api.expenses.list()]);
    setRows(a);
    setExpenses(b);
  }, [api, session?.user.role]);
  useFocusEffect(
    useCallback(() => {
      load().catch((e) => setError(e.message));
    }, [load]),
  );
  async function action(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      setMessage("Operação registrada.");
      setDescription("");
      setAmount("");
      setCounted("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function safe(fn: () => void) {
    try {
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Screen
      admin
      title="Caixa e despesas"
      subtitle="Dinheiro físico separado dos recebimentos digitais."
      busy={busy}
    >
      <Notice error message={error} />
      <Notice message={message} />
      {!rows.some((x) => x.date === today()) && (
        <Card>
          <Title>Abrir caixa de hoje</Title>
          <Field
            label="Saldo inicial em dinheiro (R$)"
            value={initial}
            onChangeText={setInitial}
            numeric
          />
          <Button
            title="Abrir caixa"
            disabled={busy}
            onPress={() =>
              safe(() => action(() => api.cash.open(cents(initial))))
            }
          />
        </Card>
      )}
      {rows.map((x) => (
        <Card key={x.date}>
          <Text style={s.badge}>{x.status.replaceAll("_", " ")}</Text>
          <Title>{x.date.split("-").reverse().join("/")}</Title>
          <Muted>Saldo inicial: {brl(x.initial)}</Muted>
          {x.expected !== null && (
            <>
              <Muted>Dinheiro esperado: {brl(x.expected)}</Muted>
              {x.counted !== null && (
                <>
                  <Muted>Dinheiro contado: {brl(x.counted)}</Muted>
                  <Text style={s.title}>
                    Diferença: {brl(x.counted - x.expected)}
                  </Text>
                </>
              )}
            </>
          )}
          {x.status === "aberto" && (
            <Button
              title="Fechar caixa para conferência"
              onPress={() => action(() => api.cash.close(x.date))}
            />
          )}{" "}
          {x.status === "aguardando_conferencia" && (
            <>
              <Field
                label="Dinheiro contado (R$)"
                value={counted}
                onChangeText={setCounted}
                numeric
              />
              <Button
                title="Confirmar contagem"
                onPress={() =>
                  safe(() =>
                    action(() => api.cash.reconcile(x.date, cents(counted))),
                  )
                }
              />
            </>
          )}
        </Card>
      ))}
      <Card>
        <Title>Registrar despesa paga hoje</Title>
        <Field
          label="Descrição"
          value={description}
          onChangeText={setDescription}
        />
        <Field
          label="Valor (R$)"
          value={amount}
          onChangeText={setAmount}
          numeric
        />
        <Chips
          items={["pix", "dinheiro", "debito", "credito"].map((x) => ({
            id: x,
            label: x,
          }))}
          value={method}
          onSelect={setMethod}
        />
        <Button
          title="Registrar despesa"
          disabled={busy}
          onPress={() =>
            safe(() =>
              action(() => api.expenses.create({
                description,
                amount: cents(amount),
                method,
                date: today(),
              })),
            )
          }
        />
      </Card>
      {expenses.slice(0, 20).map((x) => (
        <Card key={x.id}>
          <Title>{x.description}</Title>
          <Muted>
            {x.date} · {x.method}
          </Muted>
          <Text style={s.number}>{brl(x.amount)}</Text>
        </Card>
      ))}
    </Screen>
  );
}
