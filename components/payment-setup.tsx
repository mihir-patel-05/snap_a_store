"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Store, PaymentConnection, StoreBusiness } from "@/lib/contracts";

const emptyBusiness: StoreBusiness = {
  email: "",
  pickup: "",
  returns: "",
  taxPercent: "",
};
export function PaymentSetup({
  store,
  onSaved,
}: {
  store: Store;
  onSaved?: () => void;
}) {
  const [connection, setConnection] = useState<PaymentConnection | null>(null);
  const [details, setDetails] = useState<StoreBusiness>(
    store.business || emptyBusiness,
  );
  const [locationId, setLocationId] = useState(store.locationId || "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    api<PaymentConnection>(`/stores/${store.id}/square`)
      .then((r) => {
        if (!active) return;
        setConnection(r);
        setLocationId(r.locationId || "");
        setDetails(r.business || emptyBusiness);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [store.id]);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>(
        `/stores/${store.id}/square/connect`,
        { method: "POST", body: JSON.stringify({ client: "web" }) },
      );
      window.location.assign(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect Square.");
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await api<PaymentConnection>(
        `/stores/${store.id}/square`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...(locationId ? { locationId } : {}),
            business: details,
          }),
        },
      );
      setConnection(result);
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save store settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="payment-setup" aria-label="Store payment setup">
      <div className="payment-setup-heading">
        <div>
          <span className="eyebrow">YOUR STORE, YOUR PAYMENTS</span>
          <h2>
            {connection?.connected
              ? "Square is connected"
              : "Connect your Square account"}
          </h2>
          <p>
            Payments go directly to your Square account. Add your pickup details
            before publishing.
          </p>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => void connect()}
          disabled={busy || connection?.available === false}
        >
          {connection?.connected ? "Reconnect Square" : "Connect Square"}
        </button>
      </div>
      {connection?.available === false && (
        <p>
          Square onboarding is not available yet. Please contact the store
          platform administrator.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="payment-settings-form"
      >
        {!!connection?.locations.length && (
          <label>
            Payment location
            <select
              required
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={busy}
            >
              <option value="">Choose your location</option>
              {connection.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Customer support email
          <input
            type="email"
            required
            maxLength={254}
            value={details.email}
            onChange={(e) => setDetails({ ...details, email: e.target.value })}
          />
        </label>
        <label>
          Sales tax (%)
          <input
            type="number"
            required
            min="0"
            max="30"
            step="0.0001"
            value={details.taxPercent}
            onChange={(e) =>
              setDetails({ ...details, taxPercent: e.target.value })
            }
          />
        </label>
        <label>
          Pickup instructions
          <textarea
            required
            minLength={3}
            maxLength={1000}
            value={details.pickup}
            onChange={(e) => setDetails({ ...details, pickup: e.target.value })}
          />
        </label>
        <label>
          Return policy
          <textarea
            required
            minLength={3}
            maxLength={1000}
            value={details.returns}
            onChange={(e) =>
              setDetails({ ...details, returns: e.target.value })
            }
          />
        </label>
        <button type="submit" className="button secondary" disabled={busy}>
          {busy ? "Please wait…" : "Save store settings"}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && <p role="status">Store settings saved.</p>}
    </section>
  );
}
