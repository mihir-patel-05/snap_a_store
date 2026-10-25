"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, X } from "lucide-react";
import { api } from "@/lib/client";
import { newRequestKey } from "@/lib/request-key";
import {
  money,
  type Item,
  type ListingKit,
  type MarketplaceCondition,
  type StoreSnapshot,
} from "@/lib/contracts";
const CONDITIONS: MarketplaceCondition[] = [
  "New",
  "Used – Like New",
  "Used – Good",
  "Used – Fair",
];
const MARKETPLACE_CREATE = "https://www.facebook.com/marketplace/create/item";

// Facebook offers no listing API for personal accounts, so this panel prepares
// everything to paste into Facebook's own form. Buyers then buy on Marketplace,
// and the seller records holds and sales here so the storefront stays accurate.
export function MarketplacePanel({
  storeId,
  item,
  onClose,
  onSnapshot,
}: {
  storeId: string;
  item: Item;
  onClose: () => void;
  onSnapshot: (snapshot: StoreSnapshot) => void;
}) {
  const [kit, setKit] = useState<ListingKit | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [condition, setCondition] = useState<MarketplaceCondition | "">(""),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [link, setLink] = useState(""),
    [quantity, setQuantity] = useState(1);
  const saleKey = useRef("");
  const base = `/stores/${storeId}/items/${encodeURIComponent(item.id)}`;
  function show(next: ListingKit) {
    setKit(next);
    setTitle(next.title);
    setDescription(next.description);
    setCondition(next.condition);
    setLink(next.url || "");
  }
  useEffect(() => {
    api<ListingKit>(`${base}/listing`)
      .then(show)
      .catch((e: { status?: number; message?: string }) => {
        if (e.status !== 404) setError(e.message || "Please try again.");
      })
      .finally(() => setLoading(false));
  }, [base]);
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }
  const write = () =>
    run("Writing your listing", async () => {
      show(
        await api<ListingKit>(`${base}/listing`, {
          method: "POST",
          body: JSON.stringify(condition ? { condition } : {}),
        }),
      );
    });
  const update = (patch: Record<string, unknown>, message?: string) =>
    run("Saving", async () => {
      show(
        await api<ListingKit>(`${base}/listing`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      );
      if (message) setNotice(message);
    });
  const inventory = (path: string, init: RequestInit) =>
    run("Updating your store", async () => {
      onSnapshot(await api<StoreSnapshot>(`${base}/${path}`, init));
    });
  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied. Paste it into Facebook.`);
    } catch {
      setError("Copying isn't available here. Select the text instead.");
    }
  }
  const held = item.held || 0;
  const forSale = item.available + held;
  const sold = item.remaining === 0;
  const needsCondition = !kit && item.condition === "Check condition";
  const photoUrl = kit
    ? `/api${base}/listing-photo?v=${encodeURIComponent(kit.updatedAt)}`
    : "";
  const field = (label: string, value: string) => (
    <button
      type="button"
      className="text-link marketplace-copy"
      onClick={() => void copy(label, value)}
    >
      <Copy size={13} /> Copy
    </button>
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <aside
        className="cart-panel marketplace-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`List ${item.name} on Facebook Marketplace`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-heading">
          <h2>
            List it on <em>Marketplace.</em>
          </h2>
          <button
            type="button"
            className="text-link"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="marketplace-meta">
          {item.name} · {money(item.price)} ·{" "}
          {sold
            ? "sold out"
            : `${item.available} in your store${held ? `, ${held} held for Facebook` : ""}`}
        </p>
        {item.marketplace?.status === "listed" && sold && (
          <div className="marketplace-reminder">
            <span>
              This sold in your store. Mark the Facebook listing sold too so
              buyers stop messaging you.
            </span>
            <button
              type="button"
              className="button"
              onClick={() =>
                void update({ status: "closed" }, "Marked as done.")
              }
            >
              <Check size={15} /> Done
            </button>
          </div>
        )}
        {loading && <p className="marketplace-meta">Loading…</p>}
        {!loading && !kit && (
          <>
            <p className="marketplace-meta">
              Claude writes a clean title and description from this item. The
              price is always your published price, and the listing sends buyers
              no links: they buy through Facebook.
            </p>
            {needsCondition && (
              <label className="marketplace-field">
                <span>Condition (check the item first)</span>
                <select
                  value={condition}
                  onChange={(e) =>
                    setCondition(e.target.value as MarketplaceCondition)
                  }
                >
                  <option value="">Choose…</option>
                  {CONDITIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="button primary wide"
              disabled={!!busy || (needsCondition && !condition)}
              onClick={() => void write()}
            >
              Write my listing
            </button>
          </>
        )}
        {kit && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="marketplace-photo"
              src={photoUrl}
              alt={`Listing photo of ${item.name}`}
            />
            <div className="marketplace-actions">
              <a className="button" href={photoUrl} download>
                <Download size={15} /> Download photo
              </a>
              {item.box && (
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    void update({ crop: kit.crop ? null : item.box })
                  }
                >
                  {kit.crop ? "Use whole photo" : "Use suggested crop"}
                </button>
              )}
            </div>
            <label className="marketplace-field">
              <span>Title {field("Title", title)}</span>
              <input
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="marketplace-field">
              <span>Price {field("Price", item.price.toFixed(2))}</span>
              <b>{money(item.price)}</b>
            </div>
            <div className="marketplace-field">
              <span>Category {field("Category", kit.category)}</span>
              <b>{kit.category}</b>
            </div>
            <div className="marketplace-field">
              <span>Condition</span>
              <b>{kit.condition}</b>
            </div>
            <label className="marketplace-field">
              <span>Description {field("Description", description)}</span>
              <textarea
                rows={7}
                value={description}
                maxLength={2000}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            {kit.tags.length > 0 && (
              <div className="marketplace-field">
                <span>Tags {field("Tags", kit.tags.join(", "))}</span>
                <b>{kit.tags.join(", ")}</b>
              </div>
            )}
            {kit.warnings.map((w) => (
              <p key={w} className="marketplace-warning">
                Check: {w}
              </p>
            ))}
            <div className="marketplace-actions">
              {(title !== kit.title || description !== kit.description) && (
                <button
                  type="button"
                  className="button"
                  disabled={!!busy}
                  onClick={() =>
                    void update({ title, description }, "Listing saved.")
                  }
                >
                  Save edits
                </button>
              )}
              <button
                type="button"
                className="button"
                disabled={!!busy}
                onClick={() => void write()}
              >
                Rewrite
              </button>
            </div>
            <a
              className="button primary wide"
              href={MARKETPLACE_CREATE}
              target="_blank"
              rel="noreferrer"
            >
              Open Marketplace <ExternalLink size={15} />
            </a>
            {kit.status === "draft" ? (
              <>
                <label className="marketplace-field">
                  <span>Listing link (optional)</span>
                  <input
                    type="url"
                    value={link}
                    placeholder="https://www.facebook.com/marketplace/item/…"
                    onChange={(e) => setLink(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button wide"
                  disabled={!!busy}
                  onClick={() =>
                    void update(
                      { status: "listed", url: link.trim() },
                      "Marked as listed on Facebook.",
                    )
                  }
                >
                  I listed it
                </button>
              </>
            ) : (
              <p className="marketplace-meta">
                {kit.status === "listed"
                  ? "Listed on Facebook"
                  : "Facebook listing closed"}
                {kit.url && (
                  <>
                    {" · "}
                    <a href={kit.url} target="_blank" rel="noreferrer">
                      Open listing
                    </a>
                  </>
                )}
              </p>
            )}
          </>
        )}
        {!sold && (
          <div className="marketplace-buyer">
            <strong>A Facebook buyer?</strong>
            <p className="marketplace-meta">
              Hold it while they come to pick it up, so nobody buys it from your
              store. Mark it sold when they&apos;ve paid you.
            </p>
            {forSale > 1 && (
              <label className="marketplace-field">
                <span>Quantity (of {forSale})</span>
                <input
                  type="number"
                  min={1}
                  max={forSale}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      Math.min(
                        forSale,
                        Math.max(1, e.target.valueAsNumber || 1),
                      ),
                    )
                  }
                />
              </label>
            )}
            <div className="marketplace-actions">
              {held ? (
                <button
                  type="button"
                  className="button"
                  disabled={!!busy}
                  onClick={() =>
                    void inventory("facebook-hold", { method: "DELETE" })
                  }
                >
                  Release hold
                </button>
              ) : (
                <button
                  type="button"
                  className="button"
                  disabled={!!busy || !forSale}
                  onClick={() =>
                    void inventory("facebook-hold", {
                      method: "POST",
                      body: JSON.stringify({
                        quantity: Math.min(quantity, forSale),
                      }),
                    })
                  }
                >
                  Hold for Facebook buyer
                </button>
              )}
              <button
                type="button"
                className="button primary"
                disabled={!!busy || !forSale}
                onClick={() =>
                  void run("Updating your store", async () => {
                    saleKey.current ||= await newRequestKey();
                    onSnapshot(
                      await api<StoreSnapshot>(`${base}/sold-elsewhere`, {
                        method: "POST",
                        body: JSON.stringify({
                          quantity: Math.min(quantity, forSale),
                          requestKey: saleKey.current,
                        }),
                      }),
                    );
                    saleKey.current = "";
                    setQuantity(1);
                    setNotice("Recorded the Facebook sale.");
                  })
                }
              >
                Sold on Facebook
              </button>
            </div>
          </div>
        )}
        {busy && <p className="marketplace-meta">{busy}…</p>}
        {notice && (
          <p className="marketplace-meta" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </aside>
    </div>
  );
}
