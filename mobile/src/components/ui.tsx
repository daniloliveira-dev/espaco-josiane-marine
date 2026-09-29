import React from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../core";
export const colors = {
  bg: "#0c0b0d",
  card: "#1b181d",
  accent: "#bd79a2",
  text: "#f5eff2",
  muted: "#afa1ac",
  border: "#342a33",
};
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && {
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: colors.border,
        },
        (pressed || disabled) && { opacity: 0.5 },
      ]}
    >
      <Text
        style={{
          color: secondary ? colors.text : "#170e14",
          fontWeight: "700",
          fontSize: 14,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  secure = false,
  placeholder = "",
  numeric = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        keyboardType={numeric ? "decimal-pad" : "default"}
        style={s.input}
      />
    </View>
  );
}
export const Card = ({ children }: { children: React.ReactNode }) => (
  <View style={s.card}>{children}</View>
);
export const Title = ({ children }: { children: React.ReactNode }) => (
  <Text style={s.title}>{children}</Text>
);
export const Muted = ({ children }: { children: React.ReactNode }) => (
  <Text style={s.muted}>{children}</Text>
);
export function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return message ? (
    <View
      accessibilityRole="alert"
      style={[s.notice, error && { borderColor: "#b75d71" }]}
    >
      <Text style={{ color: error ? "#ffb1c0" : colors.text }}>{message}</Text>
    </View>
  ) : null;
}
export function Chips({
  items,
  value,
  onSelect,
}: {
  items: { id: string | number; label: string }[];
  value: string | number;
  onSelect: (id: any) => void;
}) {
  return (
    <View style={s.wrap}>
      {items.map((x) => (
        <Pressable
          accessibilityRole="button"
          key={x.id}
          onPress={() => onSelect(x.id)}
          style={[
            s.chip,
            value === x.id && {
              backgroundColor: colors.accent,
              borderColor: colors.accent,
            },
          ]}
        >
          <Text
            style={{
              color: value === x.id ? "#170e14" : colors.text,
              fontSize: 13,
            }}
          >
            {x.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Screen({
  title,
  subtitle,
  children,
  busy = false,
  admin = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  busy?: boolean;
  admin?: boolean;
}) {
  const { session } = useAuth(),
    path = usePathname();
  const tabs =
    session?.user.role === "admin"
      ? [
          ["/home", "Início", "grid-outline"],
          ["/booking", "Agendar", "add-circle-outline"],
          ["/appointments", "Agenda", "calendar-outline"],
          ["/manage", "Gestão", "options-outline"],
          ["/cash", "Caixa", "wallet-outline"],
          ["/reports", "Relatórios", "bar-chart-outline"],
        ]
      : [
          ["/booking", "Agendar", "add-circle-outline"],
          ["/appointments", "Meus horários", "calendar-outline"],
          ["/profile", "Perfil", "person-outline"],
        ];
  if (admin && session?.user.role !== "admin")
    return (
      <SafeAreaView style={s.root}>
        <Notice error message="Acesso exclusivo do administrador" />
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={s.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.header}>
            <View>
              <Text style={s.brand}>JOSIANE MARINE</Text>
              <Text style={s.overline}>ESPAÇO DE BELEZA</Text>
            </View>
            <Pressable
              onPress={() => router.push("/profile")}
              accessibilityLabel="Meu perfil"
            >
              <Ionicons
                name="person-circle-outline"
                size={32}
                color={colors.accent}
              />
            </Pressable>
          </View>
          <Text style={s.overline}>
            {session?.user.role === "admin"
              ? "ÁREA ADMINISTRATIVA"
              : "SEU MOMENTO DE CUIDADO"}
          </Text>
          <Text style={s.hero}>{title}</Text>
          {subtitle && <Muted>{subtitle}</Muted>}
          {busy && (
            <ActivityIndicator color={colors.accent} style={{ margin: 16 }} />
          )}
          <View style={{ gap: 16, marginTop: 24 }}>{children}</View>
          <Text
            style={[
              s.muted,
              { textAlign: "center", fontSize: 11, marginTop: 28 },
            ]}
          >
            Espaço Josiane Marine · Beleza com cuidado
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      {session && (
        <View style={s.nav}>
          {tabs.map(([url, label, icon]) => (
            <Pressable
              key={url}
              onPress={() => router.replace(url as any)}
              style={s.navItem}
            >
              <Ionicons
                name={icon as any}
                size={22}
                color={path === url ? colors.accent : colors.muted}
              />
              <Text
                style={{
                  fontSize: 10,
                  color: path === url ? colors.accent : colors.muted,
                  marginTop: 5,
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}
export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: {
    padding: 24,
    paddingBottom: 36,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 38,
  },
  brand: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 21,
    color: colors.text,
    letterSpacing: 2,
  },
  overline: {
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 2,
    marginTop: 8,
  },
  hero: {
    fontSize: 34,
    color: colors.text,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    marginTop: 12,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  title: { fontSize: 19, color: colors.text, fontWeight: "600" },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  label: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  input: {
    color: colors.text,
    backgroundColor: "#131015",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 50,
  },
  button: {
    backgroundColor: colors.accent,
    padding: 15,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  notice: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: "#241b24",
  },
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    backgroundColor: "#151216",
    justifyContent: "space-around",
  },
  navItem: { alignItems: "center", flex: 1 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  number: { fontSize: 29, color: colors.text, fontWeight: "600" },
  badge: {
    fontSize: 11,
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
