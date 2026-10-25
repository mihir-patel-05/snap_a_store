"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  QrCode,
  Sparkles,
  Trash2,
  ArrowLeft,
  TrendingUp,
  ScanLine,
} from "lucide-react";
import { Brand, ItemArt } from "@/components/brand";
import { newRequestKey } from "@/lib/request-key";
import { api, useStore } from "@/lib/client";
import {
  money,
  type DraftItem,
  type Store,
  type StoreSummary,
  type Comparison,
} from "@/lib/contracts";
type SellerStores = { store: Store; stores: StoreSummary[] };
const activeStoreKey = "snap-active-store";
export default function Studio() {
  const [store, setStore] = useState<Store | null>(null),
    [stores, setStores] = useState<StoreSummary[]>([]),
    [newStoreName, setNewStoreName] = useState<string | null>(null),
    [deleteName, setDeleteName] = useState<string | null>(null),
    [restoredStore, setRestoredStore] = useState(""),
    [publishLocked, setPublishLocked] = useState(false),
    [drafts, setDrafts] = useState<DraftItem[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [booted, setBooted] = useState(false),
    [url, setUrl] = useState(""),
    [name, setName] = useState("The Sunday Edit"),
    [comparisons, setComparisons] = useState<{
      id: string;
      data: Comparison[];
      note: string;
    } | null>(null);
  const input = useRef<HTMLInputElement>(null),
    key = useRef(""),
    storeKey = useRef("");
  useEffect(() => {
    api<SellerStores>("/auth/session")
      .then(openSession)
      .catch(() => {})
      .finally(() => setBooted(true));
  }, []);
  useEffect(() => {
    if (!store) {
      setRestoredStore("");
      return;
    }
    // Drafts belong to one storefront; switching must never carry them to another.
    let draft: { items?: DraftItem[]; key?: string; locked?: boolean } | null =
      null;
    try {
      draft = JSON.parse(
        localStorage.getItem(`snap-draft-v2:${store.id}`) || "null",
      );
    } catch {}
    setDrafts(draft?.items || []);
    key.current = draft?.key || "";
    setPublishLocked(Boolean(draft?.locked));
    setRestoredStore(store.id);
  }, [store?.id]);
  useEffect(() => {
    if (!store || restoredStore !== store.id) return;
    try {
      localStorage.setItem(
        `snap-draft-v2:${store.id}`,
        JSON.stringify({
          items: drafts,
          key: key.current,
          locked: publishLocked,
        }),
      );
    } catch {}
  }, [drafts, publishLocked, restoredStore, store?.id]);
  async function ensureStore() {
    if (!store) throw new Error("Sign in to manage your store.");
    return store;
  }
  function openSession(session: SellerStores) {
    let saved = "";
    try {
      saved = localStorage.getItem(activeStoreKey) || "";
    } catch {}
    setStores(session.stores);
    selectStore(session.stores.find((s) => s.id === saved) || session.store);
  }
  function selectStore(next: Store) {
    setStore(next);
    setName(next.name);
    setUrl("");
    setComparisons(null);
    setDeleteName(null);
    try {
      localStorage.setItem(activeStoreKey, next.id);
    } catch {}
  }
  async function loadStores() {
    try {
      setStores((await api<{ stores: StoreSummary[] }>("/stores")).stores);
    } catch {}
  }
  function openStore() {
    void work("Opening a new storefront", async () => {
      // One key per intended storefront, so a retried request cannot create a duplicate.
      storeKey.current ||= await newRequestKey();
      const result = await api<SellerStores>("/stores", {
        method: "POST",
        body: JSON.stringify({
          name: newStoreName,
          requestKey: storeKey.current,
        }),
      });
      storeKey.current = "";
      setNewStoreName(null);
      setStores(result.stores);
      selectStore(result.store);
    });
  }
  function deleteStore() {
    void work("Deleting this storefront", async () => {
      const s = await ensureStore();
      let result: SellerStores;
      try {
        result = await api<SellerStores>(`/stores/${s.id}`, {
          method: "DELETE",
          body: JSON.stringify({ name: deleteName }),
        });
      } catch (e) {
        // A retry after a lost response finds the storefront already gone.
        if ((e as { status?: number }).status !== 404) throw e;
        result = await api<SellerStores>("/auth/session");
      }
      try {
        localStorage.removeItem(`snap-draft-v2:${s.id}`);
      } catch {}
      setStores(result.stores);
      selectStore(result.store);
    });
  }
  async function signIn() {
    await work("Signing in", async () => {
      const { store } = await api<{ store: Store }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const { stores } = await api<{ stores: StoreSummary[] }>("/stores");
      openSession({ store, stores });
      setPassword("");
    });
  }
  async function signOut() {
    await work("Signing out", async () => {
      await api("/auth/logout", { method: "POST", body: "{}" });
      setStore(null);
      setStores([]);
      setNewStoreName(null);
      setDrafts([]);
      setUrl("");
    });
  }
  async function work(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      if ((e as { status?: number }).status === 401) setStore(null);
    } finally {
      setBusy("");
    }
  }
  function scan(file: File) {
    void work("Taking a closer look with Claude", async () => {
      const s = await ensureStore();
      const form = new FormData();
      form.set("photo", file);
      const r = await api<{ items: DraftItem[]; message: string }>(
        `/scan?storeId=${s.id}`,
        { method: "POST", body: form },
      );
      setDrafts(r.items);
      key.current = "";
      if (!r.items.length) setError(r.message);
    });
  }
  function change(id: string, patch: Partial<DraftItem>) {
    if (publishLocked || busy) return;
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    key.current = "";
  }
  function publish() {
    void work("Opening your store", async () => {
      if (!store) return;
      key.current ||= await newRequestKey();
      setPublishLocked(true);
      try {
        const r = await api<{ url: string }>("/publish", {
          method: "POST",
          body: JSON.stringify({
            storeId: store.id,
            requestKey: key.current,
            items: drafts,
          }),
        });
        setUrl(r.url);
        setDrafts([]);
        setPublishLocked(false);
        void loadStores();
      } catch (e) {
        if (
          [400, 401, 403, 503].includes((e as { status?: number }).status || 0)
        )
          setPublishLocked(false);
        throw e;
      }
    });
  }
  if (!booted)
    return (
      <main className="empty-page">
        <Brand />
        <Loader2 className="spin" />
      </main>
    );
  if (!store)
    return (
      <main className="checkout-page">
        <Brand />
        <section className="checkout-card">
          <span className="eyebrow">YOUR BUSINESS, WITH YOU</span>
          <h1>
            Welcome <em>back.</em>
          </h1>
          <p>Sign in to photograph, price, and sell your finds.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void signIn();
            }}
            className="login-form"
          >
            <label>
              Email
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary wide" disabled={!!busy}>
              {busy || "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          <small>Use the seller account configured for your store.</small>
        </section>
      </main>
    );
  return (
    <main className="studio">
      <header className="site-header">
        <Brand />
        <button className="text-link" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>
      <div className="studio-layout">
        <aside className="studio-side">
          <span className="eyebrow">YOUR LITTLE BUSINESS</span>
          <h2>{name}</h2>
          <div className="side-nav">
            <span className="active">
              <ScanLine size={19} /> Add finds
            </span>
            <a href={store ? `/s/${store.id}` : "#start"}>
              <QrCode size={19} /> Storefront <ExternalLink size={14} />
            </a>
          </div>
          <div className="side-bottom">
            <Sparkles size={22} />
            <p>
              Good things.
              <br />
              New beginnings.
            </p>
            <small>
              The seller app is also available in Expo for iOS and Android.
            </small>
          </div>
        </aside>
        <section className="studio-main" id="start">
          <nav className="store-switcher" aria-label="Your storefronts">
            <span className="eyebrow">YOUR STOREFRONTS</span>
            <div className="store-chips">
              {stores.map((s) => (
                <button
                  key={s.id}
                  className={
                    s.id === store.id ? "store-chip active" : "store-chip"
                  }
                  aria-current={s.id === store.id ? "true" : undefined}
                  disabled={!!busy}
                  onClick={() => {
                    if (s.id === store.id) return;
                    selectStore(s);
                    void loadStores();
                  }}
                >
                  <span className="chip-monogram">{s.name.slice(0, 1)}</span>
                  <span>
                    {s.name}
                    <small>
                      {s.closing
                        ? "Deletion unfinished"
                        : s.listed
                          ? s.available
                            ? `${s.available} available`
                            : "Sold out"
                          : "No finds yet"}
                    </small>
                  </span>
                </button>
              ))}
              {newStoreName === null ? (
                <button
                  className="store-chip add"
                  disabled={!!busy}
                  onClick={() => setNewStoreName("")}
                >
                  <Plus size={15} /> New storefront
                </button>
              ) : (
                <form
                  className="new-store"
                  onSubmit={(e) => {
                    e.preventDefault();
                    openStore();
                  }}
                >
                  <label className="sr-only" htmlFor="new-store-name">
                    New storefront name
                  </label>
                  <input
                    id="new-store-name"
                    autoFocus
                    required
                    maxLength={60}
                    placeholder="Name your storefront"
                    value={newStoreName}
                    onChange={(e) => {
                      setNewStoreName(e.target.value);
                      storeKey.current = "";
                    }}
                  />
                  <button
                    className="button primary"
                    disabled={!!busy || newStoreName.trim().length < 2}
                  >
                    Open storefront
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    disabled={!!busy}
                    onClick={() => setNewStoreName(null)}
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
          </nav>
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                {drafts.length
                  ? "A LITTLE HUMAN TOUCH"
                  : "LET’S MAKE SOMETHING OF IT"}
              </span>
              <h1>
                {drafts.length ? "Your finds, refined." : "Hello, shopkeeper."}
              </h1>
              <p>
                {drafts.length
                  ? "AI made a first pass. You make the final call."
                  : "A new home for your things starts right here."}
              </p>
            </div>
            <span className="round-icon">
              <Sparkles />
            </span>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {busy && (
            <div className="loading-banner" role="status">
              <Loader2 className="spin" />
              {busy}…
            </div>
          )}
          {drafts.length ? (
            <>
              <div className="review-note">
                <Sparkles size={19} />
                Identified by Claude . Prices are estimates. Check condition and
                quantity.
              </div>
              <div className="draft-grid">
                {drafts.map((d) => (
                  <article className="draft-card" key={d.id}>
                    <ItemArt
                      name={d.name}
                      category={d.category}
                      photoId={d.photoId}
                    />
                    <div className="draft-body">
                      <div className="card-meta">
                        <span>{d.category}</span>
                        <button
                          className="icon-button"
                          aria-label={`Remove ${d.name}`}
                          onClick={() =>
                            setDrafts((ds) => ds.filter((x) => x.id !== d.id))
                          }
                          disabled={!!busy || publishLocked}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <label className="sr-only" htmlFor={d.id}>
                        Item name
                      </label>
                      <input
                        id={d.id}
                        className="name-input"
                        disabled={!!busy || publishLocked}
                        value={d.name}
                        maxLength={100}
                        onChange={(e) => change(d.id, { name: e.target.value })}
                      />
                      <p className="confidence">
                        {d.confidence < 0.75
                          ? "Needs a closer look"
                          : "Ready for your review"}{" "}
                        · {Math.round(d.confidence * 100)}% identification
                      </p>
                      <div className="price-qty">
                        <label>
                          Your price{" "}
                          <div>
                            <span>$</span>
                            <input
                              aria-label={`Price for ${d.name}`}
                              type="number"
                              disabled={!!busy || publishLocked}
                              min="0.5"
                              max="10000"
                              step="0.01"
                              value={Number.isNaN(d.price) ? "" : d.price}
                              onChange={(e) =>
                                change(d.id, { price: e.target.valueAsNumber })
                              }
                            />
                          </div>
                        </label>
                        <label>
                          Quantity
                          <input
                            aria-label={`Quantity for ${d.name}`}
                            type="number"
                            disabled={!!busy || publishLocked}
                            min="1"
                            max="100"
                            value={Number.isNaN(d.quantity) ? "" : d.quantity}
                            onChange={(e) =>
                              change(d.id, { quantity: e.target.valueAsNumber })
                            }
                          />
                        </label>
                      </div>
                      <details>
                        <summary>Why this price?</summary>
                        <p>{d.reasoning}</p>
                      </details>
                      <button
                        className="compare-button"
                        disabled={!!busy || publishLocked}
                        onClick={() =>
                          void work(
                            "Checking current asking prices",
                            async () => {
                              const r = await api<{
                                comparisons: Comparison[];
                                note: string;
                              }>("/compare", {
                                method: "POST",
                                body: JSON.stringify({
                                  storeId: store!.id,
                                  name: d.name,
                                }),
                              });
                              setComparisons({
                                id: d.id,
                                data: r.comparisons,
                                note: r.note,
                              });
                            },
                          )
                        }
                      >
                        <TrendingUp size={15} /> Compare market prices
                      </button>
                      {comparisons?.id === d.id && (
                        <div className="comps">
                          <small>{comparisons.note}</small>
                          {comparisons.data.length ? (
                            comparisons.data.map((c) => (
                              <a
                                key={c.url}
                                href={c.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {c.title}
                                <b>{money(c.price)}</b>
                              </a>
                            ))
                          ) : (
                            <p>No comparable listings found.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <div className="publish-bar">
                <div>
                  <strong>
                    {drafts.length} finds ·{" "}
                    {money(
                      drafts.reduce((s, d) => s + d.price * d.quantity, 0),
                    )}
                  </strong>
                  <span>Total asking value</span>
                </div>
                <button
                  className="button primary"
                  disabled={
                    !!busy ||
                    drafts.some(
                      (d) =>
                        !d.name.trim() ||
                        !Number.isFinite(d.price) ||
                        d.price < 0.5 ||
                        !Number.isInteger(d.quantity) ||
                        d.quantity < 1,
                    )
                  }
                  onClick={publish}
                >
                  {publishLocked ? "Retry publishing" : "Publish my store"}{" "}
                  <ArrowRight size={18} />
                </button>
              </div>
              <button
                className="text-link"
                onClick={() => setDrafts([])}
                disabled={!!busy || publishLocked}
              >
                <ArrowLeft size={16} /> Back to dashboard
              </button>
            </>
          ) : (
            <>
              <div className="capture-panel">
                <div className="capture-copy">
                  <span className="mini-pill">
                    <Camera size={14} /> FROM TABLE TO STOREFRONT
                  </span>
                  <h2>
                    Got a few
                    <br />
                    <em>good things?</em>
                  </h2>
                  <p>
                    Snap them together. We’ll help with names and prices, and
                    you take it from there.
                  </p>
                  <button
                    className="button primary"
                    disabled={!!busy || publishLocked}
                    onClick={() => input.current?.click()}
                  >
                    <Camera size={19} /> Add a photo
                  </button>

                  <input
                    ref={input}
                    hidden
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    onChange={(e) => {
                      if (e.target.files?.[0]) scan(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
                <div className="capture-picture">
                  <img
                    src="/table.svg"
                    alt="Illustration of secondhand finds"
                  />
                  <span className="illustration-label">
                    Make room for something new
                  </span>
                </div>
              </div>
              {!store && (
                <label className="store-name-label">
                  Give your store a name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                  />
                </label>
              )}
              {store && <Dashboard id={store.id} />}
              {url && (
                <div className="success-card">
                  <Check />
                  <div>
                    <h3>You’re open for good.</h3>
                    <p>
                      Share your storefront. Every find deserves a next chapter.
                    </p>
                    <a className="button primary" href={url}>
                      Visit my store <ExternalLink size={17} />
                    </a>
                  </div>
                  <img
                    src={`/api/stores/${store!.id}/qr`}
                    alt="Storefront QR code"
                  />
                </div>
              )}
              <div className="helper-row">
                <span>
                  <Check size={17} /> You confirm every price
                </span>
                <span>
                  <QrCode size={17} /> One QR for everything
                </span>
                <span>
                  <Plus size={17} /> Stock updates as things sell
                </span>
              </div>
              <section
                className="danger-zone"
                aria-labelledby="delete-store-title"
              >
                <div>
                  <h3 id="delete-store-title">Delete this storefront</h3>
                  <p>
                    Permanently removes {store.name}: its link and QR code,
                    every listing and photo, its items in your Square catalog,
                    and this app’s record of its sales. Payments and receipts
                    stay in your Square account.
                    {stores.length < 2 &&
                      " Because it is your only storefront, a new empty one opens in its place."}
                  </p>
                </div>
                {deleteName === null ? (
                  <button
                    className="button danger"
                    disabled={!!busy}
                    onClick={() => setDeleteName("")}
                  >
                    <Trash2 size={17} />
                    {store.closing ? "Finish deleting" : "Delete storefront"}
                  </button>
                ) : (
                  <form
                    className="delete-confirm"
                    onSubmit={(e) => {
                      e.preventDefault();
                      deleteStore();
                    }}
                  >
                    <label htmlFor="delete-store-name">
                      Type <b>{store.name}</b> to confirm
                    </label>
                    <input
                      id="delete-store-name"
                      autoFocus
                      autoComplete="off"
                      maxLength={60}
                      value={deleteName}
                      onChange={(e) => setDeleteName(e.target.value)}
                    />
                    <div>
                      <button
                        className="button danger"
                        disabled={!!busy || deleteName.trim() !== store.name}
                      >
                        <Trash2 size={17} /> Delete forever
                      </button>
                      <button
                        type="button"
                        className="text-link"
                        disabled={!!busy}
                        onClick={() => setDeleteName(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
function ArrowUpRightIcon() {
  return <ExternalLink size={14} />;
}
function Dashboard({ id }: { id: string }) {
  const { data } = useStore(id);
  if (!data?.items.length) return null;
  return (
    <>
      <div className="stats">
        <div>
          <span>Sales</span>
          <strong>{money(data.stats.revenue)}</strong>
        </div>
        <div>
          <span>Found a new home</span>
          <strong>
            {data.stats.sold}
            <small> items</small>
          </strong>
        </div>
        <div>
          <span>Still to discover</span>
          <strong>
            {data.items.reduce((s, i) => s + i.available, 0)}
            <small> items</small>
          </strong>
        </div>
      </div>
      <div className="section-heading small">
        <h2>Your collection</h2>
        <a href={`/s/${id}`} className="text-link">
          Open storefront <ExternalLink size={16} />
        </a>
      </div>
      <div className="inventory-list">
        {data.items.map((i) => (
          <div key={i.id}>
            <ItemArt name={i.name} category={i.category} photoId={i.photoId} />
            <span>
              <strong>{i.name}</strong>
              <small>
                {i.remaining === 0
                  ? "Sold out"
                  : `${i.available} available${i.remaining > i.available ? " · checkout in progress" : ""}`}
              </small>
            </span>
            <b>{money(i.price)}</b>
          </div>
        ))}
      </div>
    </>
  );
}
