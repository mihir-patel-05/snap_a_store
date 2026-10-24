import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  DraftItem,
  Store,
  StoreSnapshot,
  Integration,
  Comparison,
} from "../../lib/contracts";
export type { DraftItem, Store, StoreSnapshot, Integration, Comparison };
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000")
).replace(/\/$/, "");
export const money = (value: number) => `$${value.toFixed(value % 1 ? 2 : 0)}`;
const key = "snap-owner-v2";
export type Session = { store: Store; token: string };
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
  const text = JSON.stringify(session);
  if (Platform.OS === "web") await AsyncStorage.setItem(key, text);
  else await SecureStore.setItemAsync(key, text);
}
export async function api<T>(
  path: string,
  token?: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
      signal: AbortSignal.timeout(65000),
    });
  } catch {
    throw new Error(
      `Can't reach your store server. Check your connection and EXPO_PUBLIC_API_URL (${API_URL}).`,
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The server returned an unexpected response. Please retry.",
    );
  }
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || "Something went wrong. Please try again."),
      { status: response.status },
    );
  return data as T;
}
