import React, { useState, useCallback } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import { useAuth, brl, cents } from "../core";
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
export default function Order() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, session } = useAuth();
  const [data, setData] = useState<any>(null),
    [products, setProducts] = useState<any[]>([]),
    [services, setServices] = useState<any[]>([]),
    [kind, setKind] = useState<"produto" | "servico">("produto"),
    [item, setItem] = useState(0),
    [quantity, setQuantity] = useState("1"),
    [discount, setDiscount] = useState("0"),
    [extra, setExtra] = useState("0"),
    [reason, setReason] = useState(""),
    [payment, setPayment] = useState(0),
    [refund, setRefund] = useState(""),
    [refundReason, setRefundReason] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (session?.user.role !== "admin") return;
    const [a, b, c] = await Promise.all([
      api.appointments.order(Number(id)),
      api.products.list(),
      api.services.list(),
    ]);
    setData(a);
    setProducts(b);
    setServices(c);
    setDiscount(((a.adjustment?.discount || 0) / 100).toFixed(2));
    setExtra(((a.adjustment?.extra || 0) / 100).toFixed(2));
    setReason(a.adjustment?.reason || "");
  }, [api, session?.user.role, id]);
  useFocusEffect(
    useCallback(() => {
      void load().catch((e) => setError(e.message));
    }, [load]),
  );
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage("Comanda atualizada.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const editable =
    data &&
    ["confirmado", "em_atendimento", "aguardando_confirmacao"].includes(
      data.appointment.status,
    );
  return (
    <Screen
      admin
      title={`Comanda #${id}`}
      subtitle="Serviços, produtos e pagamentos do atendimento."
      busy={busy}
    >
      <Notice error message={error} />
      <Notice message={message} />
      {data && (
        <>
          <Card>
            <Title>{data.appointment.service_name}</Title>
            {data.items.map((x: any) => (
              <Card key={x.id}>
                <Title>
                  {x.name} × {x.quantity}
                </Title>
                <Muted>{brl(x.unit_price * x.quantity)}</Muted>
                {editable && x.kind === "produto" && (
                  <Button
                    secondary
                    title="Remover produto"
                    onPress={() =>
                      action(() =>
                        api.appointments.removeOrderItem(Number(id), x.id),
                      )
                    }
                  />
                )}
              </Card>
            ))}
            <Text style={s.number}>Total {brl(data.appointment.price)}</Text>
          </Card>
          {editable && (
            <>
              <Card>
                <Title>Adicionar à comanda</Title>
                <Chips
                  items={[
                    { id: "produto", label: "Produto" },
                    { id: "servico", label: "Serviço adicional" },
                  ]}
                  value={kind}
                  onSelect={(v) => {
                    setKind(v);
                    setItem(0);
                  }}
                />
                <Chips
                  items={(kind === "produto" ? products : services)
                    .filter((x) => x.active)
                    .map((x) => ({
                      id: x.id,
                      label: `${x.name} · ${brl(x.price)}`,
                    }))}
                  value={item}
                  onSelect={setItem}
                />
                <Field
                  label="Quantidade"
                  value={quantity}
                  onChangeText={setQuantity}
                  numeric
                />
                <Button
                  disabled={!item || busy}
                  title="Adicionar item"
                  onPress={() =>
                    action(() =>
                      api.appointments.addOrderItem(Number(id), {
                        kind,
                        item_id: item,
                        quantity: Number(quantity),
                      }),
                    )
                  }
                />
                <Muted>
                  Serviços adicionais ampliam a reserva e exigem disponibilidade
                  da mesma profissional.
                </Muted>
              </Card>
              <Card>
                <Title>Desconto ou acréscimo</Title>
                <Field
                  label="Desconto (R$)"
                  value={discount}
                  onChangeText={setDiscount}
                  numeric
                />
                <Field
                  label="Acréscimo (R$)"
                  value={extra}
                  onChangeText={setExtra}
                  numeric
                />
                <Field
                  label="Justificativa"
                  value={reason}
                  onChangeText={setReason}
                />
                <Button
                  title="Aplicar ajuste"
                  onPress={() =>
                    action(() =>
                      api.appointments.updateOrderAdjustment(Number(id), {
                        discount: cents(discount),
                        extra: cents(extra),
                        reason,
                      }),
                    )
                  }
                />
              </Card>
            </>
          )}
          <Card>
            <Title>Pagamentos registrados</Title>
            {data.payments.map((p: any) => (
              <Muted key={p.id}>
                #{p.id} · {p.method} · {brl(p.amount)}
              </Muted>
            ))}
            {!data.payments.length && (
              <Muted>Nenhum pagamento registrado.</Muted>
            )}
          </Card>
          {!!data.payments.length && (
            <Card>
              <Title>Registrar estorno</Title>
              <Chips
                items={data.payments.map((p: any) => ({
                  id: p.id,
                  label: `#${p.id} ${p.method} · ${brl(p.amount)}`,
                }))}
                value={payment}
                onSelect={setPayment}
              />
              <Field
                label="Valor a estornar (R$)"
                value={refund}
                onChangeText={setRefund}
                numeric
              />
              <Field
                label="Motivo do estorno"
                value={refundReason}
                onChangeText={setRefundReason}
              />
              <Button
                title="Confirmar estorno"
                disabled={!payment || busy}
                onPress={() =>
                  action(() =>
                    api.refunds.create({
                      payment_id: payment,
                      amount: cents(refund),
                      reason: refundReason,
                      request_key: `refund-${payment}-${Date.now()}`,
                    }),
                  )
                }
              />
              <Muted>
                Registra o estorno financeiro. Devoluções bancárias ou de cartão
                devem ser realizadas também na instituição correspondente.
              </Muted>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
