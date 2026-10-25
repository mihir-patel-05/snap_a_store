import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../lib/api";
import { connectSquareAccount } from "../lib/oauth";
import type {
  Store,
  StoreBusiness,
  PaymentConnection,
} from "../../lib/contracts";
const empty: StoreBusiness = {
  email: "",
  pickup: "",
  returns: "",
  taxPercent: "",
};
export function PaymentSetup({
  store,
  token,
  onChanged,
}: {
  store: Store;
  token: string;
  onChanged: () => void;
}) {
  const [connection, setConnection] = useState<PaymentConnection | null>(null);
  const [details, setDetails] = useState(store.business || empty),
    [locationId, setLocationId] = useState(store.locationId || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    const r = await api<PaymentConnection>(`/stores/${store.id}/square`, token);
    setConnection(r);
    setLocationId(r.locationId || "");
    setDetails(r.business || empty);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [store.id, token]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.card}>
      <Text style={s.heading}>
        {connection?.connected
          ? "Square is connected"
          : "Connect your Square account"}
      </Text>
      <Text style={s.body}>
        Payments go to your Square account. Save your pickup details before
        publishing.
      </Text>
      <Pressable
        accessibilityRole="button"
        style={s.button}
        disabled={busy || connection?.available === false}
        onPress={() =>
          void run(async () => {
            await connectSquareAccount(store.id, token);
            await load();
            onChanged();
          })
        }
      >
        <Text style={s.buttonText}>
          {connection?.connected ? "Reconnect Square" : "Connect Square"}
        </Text>
      </Pressable>
      {connection?.available === false && (
        <Text style={s.body}>
          Square onboarding is not available yet. Please contact the platform
          administrator.
        </Text>
      )}
      {!!connection?.locations.length && (
        <>
          <Text style={s.label}>PAYMENT LOCATION</Text>
          {connection.locations.map((location) => (
            <Pressable
              key={location.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: locationId === location.id }}
              disabled={busy}
              style={[s.location, locationId === location.id && s.selected]}
              onPress={() => setLocationId(location.id)}
            >
              <Text style={s.body}>
                {locationId === location.id ? "● " : "○ "}
                {location.name}
              </Text>
            </Pressable>
          ))}
        </>
      )}
      {(
        [
          { key: "email", label: "Customer support email" },
          { key: "taxPercent", label: "Sales tax (%)" },
          { key: "pickup", label: "Pickup instructions" },
          { key: "returns", label: "Return policy" },
        ] as const
      ).map(({ key, label }) => (
        <View key={key}>
          <Text style={s.label}>{label.toUpperCase()}</Text>
          <TextInput
            style={s.input}
            accessibilityLabel={label}
            editable={!busy}
            value={details[key]}
            autoCapitalize={key === "email" ? "none" : "sentences"}
            keyboardType={
              key === "email"
                ? "email-address"
                : key === "taxPercent"
                  ? "decimal-pad"
                  : "default"
            }
            multiline={key === "pickup" || key === "returns"}
            maxLength={key === "email" ? 254 : key === "taxPercent" ? 7 : 1000}
            onChangeText={(value) => setDetails({ ...details, [key]: value })}
          />
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        style={s.button}
        disabled={busy}
        onPress={() =>
          void run(async () => {
            const next = await api<PaymentConnection>(
              `/stores/${store.id}/square`,
              token,
              { ...(locationId ? { locationId } : {}), business: details },
              "PATCH",
            );
            setConnection(next);
            setMessage("Store settings saved.");
            onChanged();
          })
        }
      >
        <Text style={s.buttonText}>Save store settings</Text>
      </Pressable>
      {busy && <ActivityIndicator color="#193d33" />}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={s.body}>
          {message}
        </Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: "#fffefa",
    borderColor: "#d7dfd1",
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: "600", color: "#193d33" },
  body: { fontSize: 15, lineHeight: 22, color: "#193d33" },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#52634d",
    marginBottom: 8,
    marginTop: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d7dfd1",
    borderRadius: 8,
    minHeight: 48,
    padding: 12,
    color: "#193d33",
    fontSize: 16,
  },
  button: {
    minHeight: 48,
    backgroundColor: "#214c3e",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#a43f25", fontSize: 14, lineHeight: 21 },
  location: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#d7dfd1",
    borderRadius: 8,
  },
  selected: { backgroundColor: "#e5efcf", borderColor: "#214c3e" },
});
