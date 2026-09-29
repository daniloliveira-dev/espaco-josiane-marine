import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { useAuth, brl, today } from "../core";
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
export default function Booking() {
  const { request, session } = useAuth();
  const [services, setServices] = useState<any[]>([]),
    [pros, setPros] = useState<any[]>([]),
    [clients, setClients] = useState<any[]>([]),
    [service, setService] = useState(0),
    [pro, setPro] = useState(0),
    [client, setClient] = useState(0),
    [date, setDate] = useState(today()),
    [slots, setSlots] = useState<any[]>([]),
    [slot, setSlot] = useState(""),
    [notes, setNotes] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([
      request("/services"),
      request("/professionals"),
      session?.user.role === "admin"
        ? request("/clients")
        : Promise.resolve([]),
    ])
      .then(([a, b, c]) => {
        setServices(a.filter((x: any) => x.active));
        setPros(b.filter((x: any) => x.active));
        setClients(c);
      })
      .catch((e) => setError(e.message));
  }, [request, session?.user.role]);
  async function load() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const a = await request(
        `/availability?service_id=${service}&professional_id=${pro}&date=${date}`,
      );
      setSlots(a);
      if (!a.length)
        setMessage(
          "Não há horários disponíveis nessa data. Escolha outro dia.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function book() {
    setBusy(true);
    setError("");
    try {
      await request("/appointments", "POST", {
        service_id: service,
        professional_id: pro,
        start: slot,
        notes,
        ...(client ? { user_id: client } : {}),
      });
      setMessage("Agendamento confirmado! Consulte em Meus horários.");
      setSlots([]);
      setSlot("");
      setNotes("");
    } catch (e) {
      setError((e as Error).message);
      setSlot("");
      setSlots([]);
    } finally {
      setBusy(false);
    }
  }
  const chosen = services.find((x) => x.id === service);
  return (
    <Screen
      title="Agendar horário"
      subtitle="Escolha o cuidado, a profissional e o melhor momento."
      busy={busy}
    >
      <Notice message={error} error />
      <Notice message={message} />
      <Card>
        <Text style={s.badge}>01 · Seu cuidado</Text>
        <Title>Qual serviço você deseja?</Title>
        {services.length ? (
          <Chips
            items={services.map((x) => ({
              id: x.id,
              label: `${x.name} · ${brl(x.price)}`,
            }))}
            value={service}
            onSelect={(id) => {
              setSlots([]);
              setSlot("");
              setService(id);
              setPro(0);
            }}
          />
        ) : (
          <Muted>O salão ainda não disponibilizou serviços.</Muted>
        )}
        {chosen && (
          <Muted>
            {chosen.description || "Um cuidado especial para você."} ·{" "}
            {chosen.duration} min
          </Muted>
        )}
      </Card>
      <Card>
        <Text style={s.badge}>02 · Profissional</Text>
        <Chips
          items={pros
            .filter((x) => x.service_ids.includes(service))
            .map((x) => ({ id: x.id, label: x.name }))}
          value={pro}
          onSelect={(v) => {
            setSlots([]);
            setSlot("");
            setPro(v);
          }}
        />
        {!service && <Muted>Selecione primeiro um serviço.</Muted>}
      </Card>
      <Card>
        <Text style={s.badge}>03 · Data e horário</Text>
        <Field
          label="Data (AAAA-MM-DD)"
          value={date}
          onChangeText={(v) => {
            setSlots([]);
            setSlot("");
            setDate(v);
          }}
        />
        <Button
          title="Consultar horários disponíveis"
          disabled={!service || !pro || busy}
          onPress={load}
        />
        <Button
          secondary
          title="Entrar na lista de espera desta data"
          disabled={!service || !pro || busy}
          onPress={async () => {
            setBusy(true);
            try {
              await request("/waitlist", "POST", {
                service_id: service,
                professional_id: pro,
                date,
              });
              setMessage(
                "Você entrou na lista de espera. O salão poderá contatar você.",
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Chips
          items={slots.map((x) => ({ id: x.start, label: x.label }))}
          value={slot}
          onSelect={setSlot}
        />
      </Card>
      {session?.user.role === "admin" && (
        <Card>
          <Title>Cliente</Title>
          <Chips
            items={clients.map((c) => ({ id: c.id, label: c.name }))}
            value={client}
            onSelect={setClient}
          />
          <Muted>
            Selecione o cliente. Sem seleção, a reserva fica em seu nome.
          </Muted>
        </Card>
      )}
      <Card>
        <Title>Resumo da reserva</Title>
        <Muted>
          {chosen
            ? `${chosen.name} · ${brl(chosen.price)}`
            : "Selecione um serviço"}
        </Muted>
        <Muted>
          {slot
            ? `${date} às ${slots.find((x) => x.start === slot)?.label}`
            : "Selecione um horário disponível"}
        </Muted>
        <Field
          label="Observações (opcional)"
          value={notes}
          onChangeText={setNotes}
        />
        <Button
          title="Confirmar agendamento"
          disabled={!slot || busy}
          onPress={book}
        />
        <Muted>Disponibilidade confirmada novamente ao reservar.</Muted>
      </Card>
    </Screen>
  );
}
