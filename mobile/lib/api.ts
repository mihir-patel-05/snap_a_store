import { Platform } from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import { requestJson } from "./request";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  DraftItem,
  Store,
  StoreSummary,
  StoreSnapshot,
  Integration,
  Comparison,
} from "../../lib/contracts";
export type {
  DraftItem,
  Store,
  StoreSummary,
  StoreSnapshot,
  Integration,
  Comparison,
};
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000")
).replace(/\/$/, "");
export const money = (value: number) => `$${value.toFixed(value % 1 ? 2 : 0)}`;
const key = "snap-owner-v2";
// `store` is the storefront currently open on this device. The storefront list is
// fetched from the server, never kept in SecureStore (values should stay small).
export type Session = { store: Store; token: string };
export type SellerStores = { store: Store; stores: StoreSummary[] };
export async function loadSession(): Promise<Session | null> {
  const value =
    Platform.OS === "web"
      ? await AsyncStorage.getItem(key)
      : await SecureStore.getItemAsync(key);
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}
export async function clearSession() {
  if (Platform.OS === "web") await AsyncStorage.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}
export async function saveSession(session: Session) {
  const text = JSON.stringify({ token: session.token, store: session.store });
  if (Platform.OS === "web") await AsyncStorage.setItem(key, text);
  else await SecureStore.setItemAsync(key, text);
}
export async function api<T>(
  path: string,
  token?: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const multipart = body instanceof FormData;
  return requestJson<T>(
    `${API_URL}/api${path}`,
    {
      method: method || (body ? "POST" : "GET"),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body && !multipart ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
    },
    expoFetch,
  );
}
