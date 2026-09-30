import React, { useState } from "react";
import { Image, Text } from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "../core";
import {
  Screen,
  Card,
  Field,
  Button,
  Notice,
  Muted,
  s,
} from "../components/ui";
export default function Login() {
  const { session, setSession, api } = useAuth();
  const [register, setRegister] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (session)
    return (
      <Redirect href={session.user.role === "admin" ? "/home" : "/booking"} />
    );
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const credentials = { email: email.trim(), password };
      const data = register
        ? await api.auth.register({ ...credentials, name, phone })
        : await api.auth.login(credentials);
      await setSession(data);
      router.replace(data.user.role === "admin" ? "/home" : "/booking");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title="Bem-vinda ao seu espaço"
      subtitle="Reserve um momento só seu."
    >
      <Image
        source={require("../../assets/brand.png")}
        style={{
          width: 190,
          height: 190,
          alignSelf: "center",
          borderRadius: 20,
        }}
        resizeMode="contain"
      />
      <Card>
        <Text style={s.title}>
          {register ? "Crie sua conta" : "Entre para continuar"}
        </Text>
        {register && (
          <>
            <Field label="Seu nome" value={name} onChangeText={setName} />
            <Field
              label="Telefone / WhatsApp"
              value={phone}
              onChangeText={setPhone}
            />
          </>
        )}
        <Field label="E-mail" value={email} onChangeText={setEmail} />
        <Field
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secure
          placeholder={register ? "Pelo menos 10 caracteres" : ""}
        />
        <Notice message={error} error />
        <Button
          disabled={busy}
          title={busy ? "Aguarde…" : register ? "Criar conta" : "Entrar"}
          onPress={submit}
        />
        <Button
          secondary
          title={
            register ? "Já tenho uma conta" : "Primeiro acesso? Cadastre-se"
          }
          onPress={() => {
            setRegister(!register);
            setError("");
          }}
        />
        <Button
          secondary
          title="Esqueci minha senha"
          onPress={() => router.push("/recovery")}
        />
      </Card>
      <Muted>Agendamentos com praticidade. Cuidado em cada detalhe.</Muted>
    </Screen>
  );
}
