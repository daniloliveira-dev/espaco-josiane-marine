import React, { useState, useCallback } from "react";
import { router, useFocusEffect } from "expo-router";
import { Text, View } from "react-native";
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
export default function Manage() {
  const { api, session } = useAuth();
  const [tab, setTab] = useState("servicos"),
    [services, setServices] = useState<any[]>([]),
    [pros, setPros] = useState<any[]>([]),
    [clients, setClients] = useState<any[]>([]),
    [cfg, setCfg] = useState<any>(null),
    [blocks, setBlocks] = useState<any[]>([]),
    [edit, setEdit] = useState(0),
    [name, setName] = useState(""),
    [price, setPrice] = useState(""),
    [duration, setDuration] = useState("60"),
    [buffer, setBuffer] = useState("0"),
    [description, setDescription] = useState(""),
    [ids, setIds] = useState<number[]>([]),
    [active, setActive] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [blockPro, setBlockPro] = useState(0),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [reason, setReason] = useState("");
  const load = useCallback(async () => {
    if (session?.user.role !== "admin") return;
    const [a, b, c, d, e] = await Promise.all([
      api.services.list(),
      api.professionals.list(),
      api.users.clients(),
      api.settings.get(),
      api.blocks.list(),
    ]);
    setServices(a);
    setPros(b);
    setClients(c);
    setCfg(d);
    setBlocks(e);
  }, [api, session?.user.role]);
  useFocusEffect(
    useCallback(() => {
      void load().catch((e) => setError(e.message));
    }, [load]),
  );
  function reset() {
    setEdit(0);
    setName("");
    setPrice("");
    setDuration("60");
    setBuffer("0");
    setDescription("");
    setIds([]);
    setActive(1);
  }
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage("Salvo com sucesso.");
      reset();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    return action(() =>
      tab === "servicos"
        ? edit
          ? api.services.update(edit, {
              name,
              description,
              price: cents(price),
              duration: Number(duration),
              buffer: Number(buffer),
              active,
            })
          : api.services.create({
              name,
              description,
              price: cents(price),
              duration: Number(duration),
              buffer: Number(buffer),
              active,
            })
        : edit
          ? api.professionals.update(edit, { name, service_ids: ids, active })
          : api.professionals.create({ name, service_ids: ids, active }),
    );
  }
  return (
    <Screen
      admin
      title="Gestão do salão"
      subtitle="Configure cada detalhe da sua operação."
      busy={busy}
    >
      <Chips
        items={[
          { id: "servicos", label: "Serviços" },
          { id: "profissionais", label: "Profissionais" },
          { id: "clientes", label: "Clientes" },
          { id: "horarios", label: "Horários" },
        ]}
        value={tab}
        onSelect={(id) => {
          setTab(id);
          reset();
          setMessage("");
        }}
      />
      <Button
        secondary
        title="Produtos, comissões e lista de espera"
        onPress={() => router.push("/operations")}
      />
      <Button
        secondary
        title="Ver auditoria de atividades"
        onPress={() => router.push("/audit")}
      />
      <Notice error message={error} />
      <Notice message={message} />
      {["servicos", "profissionais"].includes(tab) && (
        <>
          <Card>
            <Title>
              {edit ? "Editar" : "Cadastrar"}{" "}
              {tab === "servicos" ? "serviço" : "profissional"}
            </Title>
            <Field label="Nome" value={name} onChangeText={setName} />
            {tab === "servicos" ? (
              <>
                <Field
                  label="Descrição"
                  value={description}
                  onChangeText={setDescription}
                />
                <Field
                  label="Preço (R$)"
                  value={price}
                  onChangeText={setPrice}
                  numeric
                />
                <Field
                  label="Duração (minutos)"
                  value={duration}
                  onChangeText={setDuration}
                  numeric
                />
                <Field
                  label="Intervalo de preparação (minutos)"
                  value={buffer}
                  onChangeText={setBuffer}
                  numeric
                />
              </>
            ) : (
              <>
                <Muted>Serviços realizados (toque para marcar)</Muted>
                <View style={s.wrap}>
                  {services.map((x) => (
                    <Button
                      key={x.id}
                      secondary={!ids.includes(x.id)}
                      title={x.name}
                      onPress={() =>
                        setIds(
                          ids.includes(x.id)
                            ? ids.filter((i) => i !== x.id)
                            : [...ids, x.id],
                        )
                      }
                    />
                  ))}
                </View>
              </>
            )}
            <Chips
              items={[
                { id: 1, label: "Ativo" },
                { id: 0, label: "Inativo" },
              ]}
              value={active}
              onSelect={setActive}
            />
            <Button
              title={edit ? "Salvar alterações" : "Cadastrar"}
              disabled={busy}
              onPress={save}
            />
            {edit > 0 && (
              <Button secondary title="Cancelar edição" onPress={reset} />
            )}
          </Card>
          {(tab === "servicos" ? services : pros).map((x) => (
            <Card key={x.id}>
              <View style={s.row}>
                <Title>{x.name}</Title>
                <Text style={s.badge}>{x.active ? "Ativo" : "Inativo"}</Text>
              </View>
              <Muted>
                {tab === "servicos"
                  ? `${brl(x.price)} · ${x.duration} min + ${x.buffer} min de intervalo`
                  : x.service_ids
                      .map(
                        (i: number) => services.find((s) => s.id === i)?.name,
                      )
                      .join(", ")}
              </Muted>
              <Button
                secondary
                title="Editar"
                onPress={() => {
                  setEdit(x.id);
                  setName(x.name);
                  setActive(x.active);
                  if (tab === "servicos") {
                    setPrice((x.price / 100).toFixed(2));
                    setDescription(x.description);
                    setDuration(String(x.duration));
                    setBuffer(String(x.buffer));
                  } else setIds(x.service_ids);
                }}
              />
            </Card>
          ))}
        </>
      )}
      {tab === "clientes" && (
        <>
          {clients.length ? (
            clients.map((x) => (
              <Card key={x.id}>
                <Title>{x.name}</Title>
                <Muted>{x.email}</Muted>
                <Muted>{x.phone || "Sem telefone informado"}</Muted>
              </Card>
            ))
          ) : (
            <Card>
              <Muted>Os clientes aparecerão após criarem suas contas.</Muted>
            </Card>
          )}
        </>
      )}
      {tab === "horarios" && cfg && (
        <>
          <Card>
            <Title>Funcionamento</Title>
            <Field
              label="Hora de abertura (0–23)"
              value={String(cfg.open_hour)}
              onChangeText={(v) => setCfg({ ...cfg, open_hour: v })}
              numeric
            />
            <Field
              label="Hora de encerramento (1–24)"
              value={String(cfg.close_hour)}
              onChangeText={(v) => setCfg({ ...cfg, close_hour: v })}
              numeric
            />
            <Muted>Dias de funcionamento</Muted>
            <View style={s.wrap}>
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, i) => (
                <Button
                  key={d}
                  secondary={!cfg.days.includes(i)}
                  title={d}
                  onPress={() =>
                    setCfg({
                      ...cfg,
                      days: cfg.days.includes(i)
                        ? cfg.days.filter((x: number) => x !== i)
                        : [...cfg.days, i],
                    })
                  }
                />
              ))}
            </View>
            <Field
              label="Fechamento automático (HH:MM)"
              value={cfg.close_time}
              onChangeText={(v) => setCfg({ ...cfg, close_time: v })}
            />
            <Field
              label="Antecedência para cancelar/reagendar (horas)"
              value={String(cfg.cancel_hours)}
              onChangeText={(v) => setCfg({ ...cfg, cancel_hours: v })}
              numeric
            />
            <Button
              title="Salvar horários"
              onPress={() =>
                action(() =>
                  api.settings.update({
                    ...cfg,
                    open_hour: Number(cfg.open_hour),
                    close_hour: Number(cfg.close_hour),
                    cancel_hours: Number(cfg.cancel_hours),
                  }),
                )
              }
            />
          </Card>
          <Card>
            <Title>Bloquear período / folga</Title>
            <Chips
              items={[
                { id: 0, label: "Todo o salão" },
                ...pros.map((p) => ({ id: p.id, label: p.name })),
              ]}
              value={blockPro}
              onSelect={setBlockPro}
            />
            <Field
              label="Início (AAAA-MM-DDTHH:MM:00-03:00)"
              value={start}
              onChangeText={setStart}
            />
            <Field
              label="Fim (AAAA-MM-DDTHH:MM:00-03:00)"
              value={end}
              onChangeText={setEnd}
            />
            <Field label="Motivo" value={reason} onChangeText={setReason} />
            <Button
              title="Bloquear período"
              onPress={() =>
                action(() =>
                  api.blocks.create({
                    professional_id: blockPro || null,
                    start,
                    end,
                    reason,
                  }),
                )
              }
            />
          </Card>
          {blocks.map((x) => (
            <Card key={x.id}>
              <Title>{x.reason || "Bloqueio"}</Title>
              <Muted>
                {x.start} → {x.end}
              </Muted>
              <Button
                secondary
                title="Remover bloqueio"
                onPress={() =>
                  action(() => api.blocks.delete(x.id))
                }
              />
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
