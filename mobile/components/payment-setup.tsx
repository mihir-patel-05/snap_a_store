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
import { C, F, R, T } from "../lib/theme";
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
              <Text
                style={[
                  s.locationText,
                  locationId === location.id && s.locationTextOn,
                ]}
              >
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
      {busy && <ActivityIndicator color={C.denim} />}
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
    backgroundColor: C.white,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.md,
    padding: 20,
    marginBottom: 20,
    gap: 14,
  },
  heading: {
    fontFamily: F.serif,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: C.ink,
  },
  body: { fontFamily: F.regular, ...T.callout, lineHeight: 23, color: C.muted },
  label: {
    fontFamily: F.semi,
    ...T.caption,
    letterSpacing: 1,
    color: C.muted,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    fontFamily: F.regular,
    ...T.body,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.sm,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: C.ink,
  },
  button: {
    minHeight: 56,
    backgroundColor: C.denim,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontFamily: F.semi, ...T.headline, color: "white" },
  error: {
    fontFamily: F.regular,
    ...T.subhead,
    lineHeight: 21,
    color: C.errorInk,
  },
  location: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.sm,
    backgroundColor: "white",
    marginBottom: 8,
  },
  selected: { backgroundColor: C.wash, borderColor: C.denim },
  locationText: { fontFamily: F.medium, ...T.callout, color: C.ink },
  locationTextOn: { fontFamily: F.semi, color: C.denim },
});
