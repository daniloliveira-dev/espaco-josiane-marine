import { useFocusEffect } from "expo-router";
import React, { useState, useCallback } from "react";
import { Text } from "react-native";
import { useAuth, cents, brl } from "../core";
import {
  Screen,
  Card,
  Title,
  Muted,
  Field,
  Button,
  Chips,
  Notice,
  s,
} from "../components/ui";
export default function Operations() {
  const { request, session } = useAuth();
  const [tab, setTab] = useState("produtos"),
    [products, setProducts] = useState<any[]>([]),
    [services, setServices] = useState<any[]>([]),
    [commissions, setCommissions] = useState<any[]>([]),
    [rules, setRules] = useState<any[]>([]),
    [waiting, setWaiting] = useState<any[]>([]),
    [name, setName] = useState(""),
    [price, setPrice] = useState(""),
    [stock, setStock] = useState("0"),
    [minimum, setMinimum] = useState("3"),
    [edit, setEdit] = useState(0),
    [percent, setPercent] = useState("0"),
    [service, setService] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (session?.user.role !== "admin") return;
    const [a, b, c, d, e] = await Promise.all([
      request("/products"),
      request("/services"),
      request("/commissions"),
      request("/commission-rules"),
      request("/waitlist"),
    ]);
    setProducts(a);
    setServices(b);
    setCommissions(c);
    setRules(d);
    setWaiting(e);
  }, [request, session?.user.role]);
  useFocusEffect(
    useCallback(() => {
      void load().catch((e) => setError(e.message));
    }, [load]),
  );
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setMessage("Operação concluída.");
      await load();
      setEdit(0);
      setName("");
      setPrice("");
      setStock("0");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      admin
      title="Operação"
      subtitle="Produtos, comissões e lista de espera."
      busy={busy}
    >
      <Chips
        items={[
          { id: "produtos", label: "Produtos" },
          { id: "comissoes", label: "Comissões" },
          { id: "espera", label: "Lista de espera" },
        ]}
        value={tab}
        onSelect={setTab}
      />
      <Notice error message={error} />
      <Notice message={message} />
      {tab === "produtos" && (
        <>
          <Card>
            <Title>{edit ? "Editar produto" : "Cadastrar produto"}</Title>
            <Field label="Nome" value={name} onChangeText={setName} />
            <Field
              label="Preço (R$)"
              value={price}
              onChangeText={setPrice}
              numeric
            />
            <Field
              label="Estoque atual"
              value={stock}
              onChangeText={setStock}
              numeric
            />
            <Field
              label="Estoque mínimo"
              value={minimum}
              onChangeText={setMinimum}
              numeric
            />
            <Button
              title="Salvar produto"
              onPress={() =>
                action(() =>
                  request(
                    "/products" + (edit ? "/" + edit : ""),
                    edit ? "PUT" : "POST",
                    {
                      name,
                      price: cents(price),
                      stock: Number(stock),
                      minimum: Number(minimum),
                    },
                  ),
                )
              }
            />
          </Card>
          {products.map((p) => (
            <Card key={p.id}>
              <Title>{p.name}</Title>
              <Text style={s.number}>{brl(p.price)}</Text>
              <Muted>
                Estoque: {p.stock}
                {p.stock <= p.minimum ? " · Estoque baixo" : ""}
              </Muted>
              <Button
                secondary
                title="Editar / repor estoque"
                onPress={() => {
                  setEdit(p.id);
                  setName(p.name);
                  setPrice((p.price / 100).toFixed(2));
                  setStock(String(p.stock));
                  setMinimum(String(p.minimum));
                }}
              />
            </Card>
          ))}
        </>
      )}
      {tab === "comissoes" && (
        <>
          <Card>
            <Title>Percentual por serviço</Title>
            <Chips
              items={services.map((x) => ({ id: x.id, label: x.name }))}
              value={service}
              onSelect={(v) => {
                setService(v);
                setPercent(
                  String(rules.find((r) => r.service_id === v)?.percent || 0),
                );
              }}
            />
            <Field
              label="Comissão (%)"
              value={percent}
              onChangeText={setPercent}
              numeric
            />
            <Button
              title="Salvar regra"
              disabled={!service}
              onPress={() =>
                action(() =>
                  request("/commission-rules/" + service, "PUT", {
                    percent: Number(percent),
                  }),
                )
              }
            />
            <Muted>
              Aplicada a novos itens. Base: valor do serviço após desconto
              proporcional. Comissões pagas geram uma única despesa.
            </Muted>
          </Card>
          {commissions.map((c) => (
            <Card key={c.appointment_id}>
              <Title>{c.professional}</Title>
              <Muted>
                Atendimento #{c.appointment_id} ·{" "}
                {c.paid_at ? "Pago" : "Disponível"}
              </Muted>
              <Text style={s.number}>{brl(c.amount)}</Text>
              {!c.paid_at && c.amount > 0 && (
                <Button
                  title="Registrar comissão paga via Pix"
                  onPress={() =>
                    action(() =>
                      request(`/commissions/${c.appointment_id}/pay`, "POST", {
                        method: "pix",
                      }),
                    )
                  }
                />
              )}
            </Card>
          ))}
        </>
      )}
      {tab === "espera" && (
        <>
          {waiting.length ? (
            waiting.map((w) => (
              <Card key={w.id}>
                <Title>{w.client}</Title>
                <Muted>
                  {w.date} · {services.find((s) => s.id === w.service_id)?.name}{" "}
                  · {w.status}
                </Muted>
              </Card>
            ))
          ) : (
            <Card>
              <Muted>Nenhum cliente na lista de espera.</Muted>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
