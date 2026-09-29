import React from "react";
import { Stack, Redirect, useSegments } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../core";
import { StatusBar } from "expo-status-bar";
function Routes() {
  const { session, ready } = useAuth();
  const segments = useSegments();
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0c0b0d",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color="#bd79a2" />
      </View>
    );
  if (
    !session &&
    segments[0] !== undefined &&
    segments[0] !== "index" &&
    segments[0] !== "recovery"
  )
    return <Redirect href="/" />;
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0c0b0d" },
        }}
      />
    </>
  );
}
export default function Layout() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}
