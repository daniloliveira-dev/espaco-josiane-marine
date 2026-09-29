import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
export async function registerPush() {
  if (Platform.OS === "web")
    throw Error("Ative as notificações no aplicativo Android ou iOS.");
  if (!Device.isDevice)
    throw Error("Use um aparelho físico para ativar notificações.");
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId;
  if (!projectId)
    throw Error(
      "O projeto Expo precisa ser configurado pelo salão antes de ativar notificações.",
    );
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("default", {
      name: "Agendamentos",
      importance: Notifications.AndroidImportance.HIGH,
    });
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted")
    status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted")
    throw Error("Autorize as notificações nas configurações do aparelho.");
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
