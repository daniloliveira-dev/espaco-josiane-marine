import { useFocusEffect } from "expo-router";
import React, { useState, useCallback } from "react";
import { Platform, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useAuth, brl, today } from "../core";
import {
  Screen,
  Card,
  Title,
  Muted,
  Field,
  Button,
  Notice,
  s,
  Chips,
} from "../components/ui";
export default function Reports() {
  const { api, session } = useAuth();
  const [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [months, setMonths] = useState<any[]>([]),
    [selectedMonth, setSelectedMonth] = useState("");
  const load = useCallback(async () => {
    if (session?.user.role !== "admin") return;
    setBusy(true);
    setError("");
    try {
      setData(await api.reports.get(from, to));
      setMonths(await api.reports.monthly());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [api, session?.user.role, from, to]);
  useFocusEffect(
    useCallback(() => {
      void load().catch((e) => setError(e.message));
    }, [load]),
  );
  async function download(format: string) {
    setBusy(true);
    setError("");
    try {
      const bytes = new Uint8Array(
        await api.reports.export(
          data?.from || from,
          data?.to || to,
          format as "csv" | "pdf",
        ),
      );
      const name = `relatorio-${data?.from || from}-${data?.to || to}.${format}`;
      if (Platform.OS === "web") {
        const blob = new Blob([bytes], {
          type: format === "pdf" ? "application/pdf" : "text/csv",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, name);
        file.create({ overwrite: true });
        file.write(bytes);
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(file.uri, {
            mimeType: format === "pdf" ? "application/pdf" : "text/csv",
          });
        else throw Error("Compartilhamento indisponível neste aparelho");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const grouped: Record<
    string,
    { name: string; count: number; total: number }
  > = {};
  data?.appointments
    .filter((a: any) => a.status === "concluido")
    .forEach((a: any) => {
      const key = a.service_name;
      grouped[key] ??= { name: key, count: 0, total: 0 };
      grouped[key].count++;
      grouped[key].total += a.price;
    });
  return (
    <Screen
      admin
      title="Relatórios"
      subtitle="Clareza para acompanhar o crescimento do salão."
      busy={busy}
    >
      <Notice error message={error} />
      <Card>
        <Title>Período</Title>
        {months.length > 0 && (
          <>
            <Muted>Relatórios mensais gerados automaticamente</Muted>
            <Chips
              items={months.map((m) => ({
                id: m.month,
                label: m.month.split("-").reverse().join("/"),
              }))}
              value={selectedMonth}
              onSelect={async (m) => {
                try {
                  setSelectedMonth(m);
                  const r = await api.reports.monthlyByMonth(m);
                  setData(r);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          </>
        )}
        <Field label="De (AAAA-MM-DD)" value={from} onChangeText={setFrom} />
        <Field label="Até (AAAA-MM-DD)" value={to} onChangeText={setTo} />
        <Button title="Gerar relatório" onPress={load} disabled={busy} />
      </Card>
      {data && (
        <>
          <Muted>
            Resultados de {data.from} a {data.to}
          </Muted>
          <View style={s.wrap}>
            {[
              ["Faturamento de atendimentos", data.revenue],
              ["Valores recebidos", data.received],
              ["Despesas pagas", data.expenses],
              ["Resultado de caixa", data.result],
              ["Saldo pendente", data.outstanding],
              ["Ticket médio", data.ticket],
            ].map(([title, val]) => (
              <View key={title} style={{ width: "45%", flexGrow: 1 }}>
                <Card>
                  <Muted>{title}</Muted>
                  <Text style={s.number}>{brl(val)}</Text>
                </Card>
              </View>
            ))}
          </View>
          <Card>
            <Title>Recebimentos por forma de pagamento</Title>
            {Object.entries(data.byMethod).map(([name, val]) => (
              <View key={name} style={s.row}>
                <Muted>{name}</Muted>
                <Text style={s.title}>{brl(Number(val))}</Text>
              </View>
            ))}
          </Card>
          <Card>
            <Title>Serviços realizados</Title>
            <Muted>{data.attendances} atendimentos concluídos</Muted>
            {Object.values(grouped)
              .sort((a, b) => b.total - a.total)
              .map((x) => (
                <View key={x.name} style={s.row}>
                  <Muted>
                    {x.name} · {x.count}x
                  </Muted>
                  <Text style={s.title}>{brl(x.total)}</Text>
                </View>
              ))}
          </Card>
          <Card>
            <Title>Exportar</Title>
            <Button
              title="Compartilhar PDF"
              onPress={() => download("pdf")}
              disabled={busy}
            />
            <Button
              secondary
              title="Exportar CSV"
              onPress={() => download("csv")}
              disabled={busy}
            />
            <Muted>
              Faturamento: comandas concluídas (serviços e produtos) pela data
              do atendimento. Recebimentos: data do pagamento. Resultado de
              caixa: recebido menos despesas pagas. Esse resultado não equivale
              a lucro contábil.
            </Muted>
            <Muted>
              Pendente: saldo atual dos atendimentos do período, inclusive
              sinais e pagamentos posteriores.
            </Muted>
          </Card>
        </>
      )}
    </Screen>
  );
}
