"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Leaf,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import { api } from "@/lib/client";
import { money, type Order } from "@/lib/contracts";
import { Brand } from "./brand";
type Receipt = Order & { pickup: string; supportEmail: string };
export function Checkout({ id }: { id: string }) {
  const [order, setOrder] = useState<Receipt | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let interval: ReturnType<typeof setInterval>;
    const refresh = async () => {
      try {
        const value = await api<Receipt>(`/orders/${id}`);
        if (!active) return;
        setOrder(value);
        setError("");
        if (value.state === "paid" || value.state === "failed") {
          clearInterval(interval);
          try {
            sessionStorage.removeItem(`snap-checkout:${value.storeId}`);
          } catch {}
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to check payment.");
      }
    };
    interval = setInterval(refresh, 4000);
    void refresh();
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [id]);
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await api(`/orders/${id}/cancel`, { method: "POST", body: "{}" });
      try {
        sessionStorage.removeItem(`snap-checkout:${order!.storeId}`);
      } catch {}
      window.location.assign(`/s/${order!.storeId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to cancel checkout.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="checkout-page">
      <Brand />
      <section className="checkout-card">
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {!order ? (
          <Loader2 className="spin" />
        ) : (
          <>
            {order.state === "paid" && (
              <div className="success-mark">
                <Check size={35} />
              </div>
            )}
            <span className="eyebrow">
              {order.state === "paid"
                ? "PAYMENT CONFIRMED"
                : order.state === "failed"
                  ? "CHECKOUT CANCELED"
                  : "AWAITING PAYMENT"}
            </span>
            <h1>
              {order.state === "paid" ? (
                <>
                  A new chapter
                  <br />
                  <em>starts here.</em>
                </>
              ) : order.state === "failed" ? (
                <>
                  Ready when
                  <br />
                  <em>you are.</em>
                </>
              ) : (
                <>
                  Good finds.
                  <br />
                  <em>All yours soon.</em>
                </>
              )}
            </h1>
            <p>
              {order.state === "paid"
                ? order.pickup
                : order.state === "failed"
                  ? "This checkout is closed. Return to the store to see what’s available."
                  : "Complete checkout on Square. This page updates when your payment is verified."}
            </p>
            <div className="receipt">
              {order.lines.map((l, i) => (
                <div key={i}>
                  <span>
                    {l.quantity} × {l.name}
                  </span>
                  <b>{money(l.price * l.quantity)}</b>
                </div>
              ))}
              {!!order.taxCents && (
                <div>
                  <span>Sales tax</span>
                  <b>{money(order.taxCents / 100)}</b>
                </div>
              )}
              <div className="receipt-total">
                <span>Total</span>
                <strong>{money(order.totalCents / 100)}</strong>
              </div>
            </div>
            {order.state === "pending" || order.state === "creating" ? (
              <>
                {order.paymentUrl && (
                  <a className="button primary wide" href={order.paymentUrl}>
                    Continue to Square
                    <ArrowRight size={18} />
                  </a>
                )}
                <div className="loading-banner" role="status">
                  <Loader2 className="spin" size={18} /> Checking payment status
                </div>
                <button className="text-link" onClick={cancel} disabled={busy}>
                  <ArrowLeft size={15} />
                  {busy
                    ? "Checking cancellation…"
                    : "Cancel checkout & release items"}
                </button>
              </>
            ) : (
              <a className="button primary wide" href={`/s/${order.storeId}`}>
                Back to the store
                <ArrowRight size={18} />
              </a>
            )}
            {order.receiptUrl && (
              <a
                className="text-link"
                href={order.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View Square receipt
              </a>
            )}
            <small>
              <LockKeyhole size={13} /> Payment processed by Square · Order{" "}
              {id.slice(0, 8)}
            </small>
            {order.supportEmail && (
              <a
                className="text-link"
                href={`mailto:${order.supportEmail}?subject=Order%20${id}`}
              >
                Contact the seller
              </a>
            )}
          </>
        )}
      </section>
      <div className="checkout-bottom">
        <Leaf size={16} /> A little less waste. A little more possibility.
      </div>
    </main>
  );
}
