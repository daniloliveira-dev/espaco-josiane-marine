import React, { useState, useCallback } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth, brl, today, displayDate } from "../core";
import {
  Screen,
  Card,
  Title,
  Muted,
  Button,
  Notice,
  s,
} from "../components/ui";
export default function Home() {
  const { session, api } = useAuth();
  const [data, setData] = useState<any>(null),
    [cash, setCash] = useState<any>(null),
    [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      if (session?.user.role !== "admin") return;
      Promise.all([
        api.reports.get(today(), today()),
        api.cash.list(),
      ])
        .then(([r, c]) => {
          setData(r);
          setCash(c.find((x: any) => x.date === today()));
        })
        .catch((e) => setError(e.message));
    }, [session, api]),
  );
  return (
    <Screen
      admin
      title={`Olá, ${session?.user.name.split(" ")[0] || "Josiane"}`}
      subtitle="Um olhar para o seu salão hoje."
      busy={!data && !error}
    >
      <Notice error message={error} />
      <Card>
        <Text style={s.badge}>RECEBIDO HOJE</Text>
        <Text style={[s.number, { fontSize: 42 }]}>{brl(data?.received)}</Text>
        <Muted>Seu cuidado transforma. Sua gestão acompanha.</Muted>
        <View style={s.row}>
          <Muted>{data?.attendances || 0} atendimentos concluídos</Muted>
          <Text style={s.badge}>{today().split("-").reverse().join("/")}</Text>
        </View>
      </Card>
      <View style={s.wrap}>
        {[
          ["Atendimentos realizados", data?.revenue],
          ["Pendente", data?.outstanding],
          ["Despesas pagas", data?.expenses],
          ["Resultado de caixa", data?.result],
        ].map(([name, val]) => (
          <View key={String(name)} style={{ flexGrow: 1, width: "45%" }}>
            <Card>
              <Muted>{name}</Muted>
              <Text style={s.number}>{brl(Number(val || 0))}</Text>
            </Card>
          </View>
        ))}
      </View>
      <Card>
        <Title>Caixa do dia</Title>
        <Muted>
          {cash ? cash.status.replaceAll("_", " ") : "Ainda não aberto"}
        </Muted>
        <Button
          secondary
          title="Gerenciar caixa"
          onPress={() => router.push("/cash")}
        />
      </Card>
      <Card>
        <Title>Agenda de hoje</Title>
        {data?.appointments
          .filter((a: any) => a.status !== "cancelado")
          .slice(0, 6)
          .map((a: any) => (
            <View key={a.id} style={s.row}>
              <View>
                <Text style={s.title}>{a.client}</Text>
                <Muted>
                  {a.service_name} · {a.professional}
                </Muted>
              </View>
              <Text style={s.badge}>
                {displayDate(a.start).split(" ").at(-1)}
              </Text>
            </View>
          ))}
        {!data?.appointments.length && (
          <Muted>A agenda está livre por enquanto.</Muted>
        )}
        <Button
          title="Ver agenda completa"
          onPress={() => router.push("/appointments")}
        />
      </Card>
    </Screen>
  );
}
