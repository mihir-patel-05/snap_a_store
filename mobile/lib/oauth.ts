import { Platform, Linking } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import { api, API_URL, type Session } from "./api";

function nativeBuild() {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
    throw new Error(
      "Use an installed development or preview build for Google, Apple, and Square sign-in. You can also sign in through the web dashboard.",
    );
}
async function browser(url: string, callback: string) {
  nativeBuild();
  const result = await WebBrowser.openAuthSessionAsync(url, callback);
  if (result.type !== "success") return null;
  const returned = new URL(result.url),
    expected = new URL(callback);
  if (
    returned.protocol !== expected.protocol ||
    returned.hostname !== expected.hostname
  )
    throw new Error(
      "Sign-in returned an unexpected address. Please try again.",
    );
  const error = returned.searchParams.get("auth_error");
  if (error) throw new Error(error.slice(0, 300));
  return returned;
}
// Both providers sign in through the backend and return a one-time grant.
export async function federatedSignIn(
  provider: "google" | "apple",
): Promise<Session | null> {
  const name = provider === "google" ? "Google" : "Apple";
  if (Platform.OS === "web") {
    await Linking.openURL(API_URL + `/api/auth/${provider}/start`);
    return null;
  }
  const verifier = Array.from(Crypto.getRandomBytes(32), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  const challenge = digest
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const returned = await browser(
    API_URL +
      `/api/auth/${provider}/start?client=native&code_challenge=` +
      challenge,
    "snapastore://auth",
  );
  if (!returned) return null;
  const code = returned.searchParams.get("code");
  if (!code)
    throw new Error(`${name} sign-in did not finish. Please try again.`);
  return api<Session>("/auth/google/exchange", undefined, { code, verifier });
}
export async function connectSquareAccount(storeId: string, token: string) {
  if (Platform.OS === "web") {
    await Linking.openURL(API_URL + "/studio");
    return;
  }
  nativeBuild();
  const result = await api<{ url: string }>(
    `/stores/${storeId}/square/connect`,
    token,
    { client: "native" },
  );
  await browser(result.url, "snapastore://square");
}
