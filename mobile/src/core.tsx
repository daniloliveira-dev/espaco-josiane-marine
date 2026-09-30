import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createApiClient, type ApiClient } from "./services/api";

export const API = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"
).replace(/\/$/, "");
export type User = {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: "admin" | "cliente";
};
type Session = { token: string; user: User };
type Auth = {
  session: Session | null;
  ready: boolean;
  setSession: (s: Session | null) => Promise<void>;
  api: ApiClient;
};
const Context = createContext<Auth>(null!);
export const useAuth = () => useContext(Context);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, change] = useState<Session | null>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS !== "web") {
          const raw = await SecureStore.getItemAsync("session");
          if (raw) change(JSON.parse(raw));
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);
  const setSession = useCallback(async (s: Session | null) => {
    change(s);
    if (Platform.OS !== "web") {
      if (s) await SecureStore.setItemAsync("session", JSON.stringify(s));
      else await SecureStore.deleteItemAsync("session");
    }
  }, []);
  const token = session?.token;
  const request = useCallback(
    async (path: string, method = "GET", body?: unknown) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const r = await fetch(API + path, {
          method,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: "Bearer " + token } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const json = r.status === 204 ? null : await r.json();
        if (r.status === 401 && token) await setSession(null);
        if (!r.ok) throw Error(json?.message || "Não foi possível concluir");
        return json;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError")
          throw Error("Conexão demorou. Tente novamente.");
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    [token, setSession],
  );
  const authenticatedFetch = useCallback(
    (path: string) =>
      fetch(API + path, {
        headers: token ? { Authorization: "Bearer " + token } : {},
      }),
    [token],
  );
  const api = useMemo(
    () => createApiClient(request, authenticatedFetch),
    [request, authenticatedFetch],
  );
  const sessionToken = session?.token;
  useEffect(() => {
    if (!ready || !sessionToken) return;
    let active = true;
    api.users
      .me()
      .then((user) => {
        if (active) void setSession({ token: sessionToken, user });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ready, sessionToken, api, setSession]);
  return (
    <Context.Provider value={{ session, ready, setSession, api }}>
      {children}
    </Context.Provider>
  );
}
export const brl = (c: number) =>
  ((c || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const displayDate = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function cents(s: string) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(s.trim()))
    throw Error("Informe um valor válido, como 80,00");
  const [a, b = ""] = s.trim().replace(",", ".").split(".");
  return Number(a) * 100 + Number(b.padEnd(2, "0"));
}
