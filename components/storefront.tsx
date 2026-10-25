"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Leaf,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Volume2,
  X,
  MapPin,
  Headphones,
} from "lucide-react";
import { Brand, ItemArt } from "./brand";
import { newRequestKey } from "@/lib/request-key";
import { api, useStore } from "@/lib/client";
import { money } from "@/lib/contracts";
export function Storefront({ id }: { id: string }) {
  const { data, error: loadError } = useStore(id),
    [cart, setCart] = useState<Record<string, number>>({}),
    [category, setCategory] = useState("All finds"),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [cartOpen, setCartOpen] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [language, setLanguage] = useState("en"),
    [business, setBusiness] = useState<{
      email: string;
      pickup: string;
      returns: string;
      taxPercent: string;
    } | null>(null),
    [audioEnabled, setAudioEnabled] = useState(false);
  const key = useRef(""),
    audio = useRef<HTMLAudioElement | null>(null),
    checkoutStarted = useRef(false),
    narrationUrl = useRef("");
  useEffect(() => {
    api<{
      business: typeof business;
      integrations: { name: string; status: string }[];
    }>("/health")
      .then((h) => {
        setBusiness(h.business);
        setAudioEnabled(
          h.integrations.some(
            (i) => i.name === "Cartesia" && i.status === "ready",
          ),
        );
      })
      .catch(() => {});
    try {
      const saved = sessionStorage.getItem(`snap-checkout:${id}`);
      if (saved) {
        const pending = JSON.parse(saved);
        setCart(pending.cart);
        key.current = pending.key;
        checkoutStarted.current = true;
      }
    } catch {}
  }, [id]);
  useEffect(
    () => () => {
      audio.current?.pause();
      if (narrationUrl.current) URL.revokeObjectURL(narrationUrl.current);
    },
    [],
  );
  const storeBusiness =
    data?.store.paymentProvider === "square_oauth"
      ? data.store.business
      : business;
  const items = data?.items || [],
    count = Object.values(cart).reduce((s, q) => s + q, 0),
    total = items.reduce((s, i) => s + (cart[i.id] || 0) * i.price, 0);
  const categories = ["All finds", ...new Set(items.map((i) => i.category))];
  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (category === "All finds" || i.category === category) &&
          `${i.name} ${i.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [items, category, query],
  );
  function add(itemId: string, delta: number) {
    if (checkoutStarted.current) return;
    setCart((old) => {
      const next = {
        ...old,
        [itemId]: Math.max(0, (old[itemId] || 0) + delta),
      };
      if (!next[itemId]) delete next[itemId];
      return next;
    });
    key.current = "";
  }
  async function checkout() {
    setBusy(true);
    setError("");
    checkoutStarted.current = true;
    try {
      key.current ||= await newRequestKey();
      try {
        sessionStorage.setItem(
          `snap-checkout:${id}`,
          JSON.stringify({ cart, key: key.current }),
        );
      } catch {}
      const result = await api<{ url: string }>("/checkout", {
        method: "POST",
        body: JSON.stringify({
          storeId: id,
          requestKey: key.current,
          lines: Object.entries(cart).map(([itemId, quantity]) => ({
            itemId,
            quantity,
          })),
        }),
      });
      window.location.assign(result.url);
    } catch (e) {
      if (
        !key.current ||
        [400, 401, 403, 404, 409, 410].includes(
          (e as { status?: number }).status || 0,
        )
      ) {
        checkoutStarted.current = false;
        key.current = "";
        try {
          sessionStorage.removeItem(`snap-checkout:${id}`);
        } catch {}
      }
      setError(e instanceof Error ? e.message : "Checkout could not open.");
    } finally {
      setBusy(false);
    }
  }
  async function listen() {
    if (speaking) {
      audio.current?.pause();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    setError("");
    try {
      const r = await fetch(`/api/stores/${id}/narration?language=${language}`);
      if (!r.ok) throw new Error((await r.json()).error);
      if (narrationUrl.current) URL.revokeObjectURL(narrationUrl.current);
      narrationUrl.current = URL.createObjectURL(await r.blob());
      const a = new Audio(narrationUrl.current);
      audio.current = a;
      a.onended = () => setSpeaking(false);
      a.onerror = () => {
        setError("Audio could not play on this device.");
        setSpeaking(false);
      };
      await a.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audio unavailable");
      setSpeaking(false);
    }
  }
  if (!data)
    return (
      <main className="empty-page">
        <Brand />
        <div>
          {loadError || (
            <>
              <Loader2 className="spin" /> Opening a little good…
            </>
          )}
        </div>
      </main>
    );
  return (
    <main className="storefront">
      <header className="site-header">
        <Brand />
        <button
          className="bag-button"
          aria-label={`Your bag, ${count} items`}
          onClick={() => setCartOpen(true)}
        >
          <ShoppingBag size={20} />
          <span>Your bag</span>
          <b>{count}</b>
        </button>
      </header>
      {data.store.paymentMode === "sandbox" && (
        <div className="environment-ribbon">Square sandbox environment</div>
      )}
      <section className="store-hero">
        <div className="store-monogram">{data.store.name.slice(0, 1)}</div>
        <div className="store-hero-copy">
          <span className="eyebrow">
            <span className="live-dot" /> A LITTLE STORE, OPEN FOR GOOD
          </span>
          <h1>{data.store.name}</h1>
          <p>{data.store.tagline} Discover something with a story.</p>
          <div className="store-details">
            <span>
              <MapPin size={14} /> {storeBusiness?.pickup || "Local pickup"}
            </span>
            <span>
              <Leaf size={14} /> Pre-loved, ready for more
            </span>
          </div>
        </div>
        <div className="store-flower" aria-hidden="true">
          ✳
        </div>
      </section>
      <div className="shop-tools">
        <div className="categories">
          {categories.map((c) => (
            <button
              key={c}
              className={category === c ? "selected" : ""}
              onClick={() => setCategory(c)}
            >
              {c}
              {c === "All finds" && <span>{items.length}</span>}
            </button>
          ))}
        </div>
        <div className="search-box">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find your next favorite"
            aria-label="Search products"
          />
        </div>
      </div>
      <div className="shop-subhead">
        <span>
          {visible.length} good {visible.length === 1 ? "find" : "finds"}
        </span>
        {audioEnabled && (
          <div>
            <select
              aria-label="Audio language"
              value={language}
              onChange={(e) => {
                audio.current?.pause();
                setSpeaking(false);
                setLanguage(e.target.value);
              }}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
            <button className="text-link" onClick={listen}>
              <Volume2 size={16} />
              {speaking ? "Stop audio" : "Listen to this store"}
            </button>
          </div>
        )}
      </div>
      {(error || loadError) && (
        <div className="error" role="alert">
          {error || loadError}
        </div>
      )}
      {visible.length ? (
        <div className="product-grid">
          {visible.map((i) => (
            <article
              key={i.id}
              className={`product-card ${!i.available ? "unavailable" : ""}`}
            >
              <div className="product-image">
                <ItemArt
                  name={i.name}
                  category={i.category}
                  photoId={i.photoId}
                />
                {!i.available ? (
                  <span className="product-badge">
                    {i.remaining ? "In someone’s bag" : "Found a new home"}
                  </span>
                ) : i.available === 1 ? (
                  <span className="product-badge">One of a kind</span>
                ) : null}
              </div>
              <div className="product-meta">
                <span>{i.category}</span>
                <span>{i.condition}</span>
              </div>
              <h2>{i.name}</h2>
              <p>{i.description}</p>
              <div className="product-buy">
                <strong>{money(i.price)}</strong>
                {cart[i.id] ? (
                  <div className="quantity-stepper">
                    <button
                      onClick={() => add(i.id, -1)}
                      disabled={checkoutStarted.current}
                      aria-label={`Remove one ${i.name}`}
                    >
                      <Minus size={15} />
                    </button>
                    <span>{cart[i.id]}</span>
                    <button
                      onClick={() => add(i.id, 1)}
                      disabled={
                        cart[i.id] >= i.available || checkoutStarted.current
                      }
                      aria-label={`Add one ${i.name}`}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="add-button"
                    disabled={!i.available || checkoutStarted.current}
                    onClick={() => add(i.id, 1)}
                  >
                    {i.available ? (
                      <>
                        <Plus size={16} /> Add to bag
                      </>
                    ) : i.remaining ? (
                      "Reserved"
                    ) : (
                      "Sold out"
                    )}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="no-results">
          <ShoppingBag />
          <h2>
            {items.length
              ? "No finds here just yet."
              : "Good things are on their way."}
          </h2>
          <p>
            {items.length
              ? "Try a different search or category."
              : "The seller is putting the finishing touches on this store."}
          </p>
        </div>
      )}
      <div className="shop-footnote">
        <Leaf size={20} />
        <p>
          Every secondhand find is a first step to less waste.
          <br />
          <strong>Thanks for giving good things a next chapter.</strong>
        </p>
      </div>
      <div className="store-policies">
        <p>{storeBusiness?.returns}</p>
        {storeBusiness?.email && (
          <a href={`mailto:${storeBusiness.email}`}>Contact the seller</a>
        )}
        <a href={`/policies?storeId=${encodeURIComponent(id)}`}>
          Pickup, returns & privacy
        </a>
      </div>
      <footer>
        <Brand />
        <p>Powered by people. A little help from technology.</p>
        <span>
          <Check size={14} /> Secure Square checkout
        </span>
      </footer>
      {count > 0 && !cartOpen && (
        <button className="floating-bag" onClick={() => setCartOpen(true)}>
          <ShoppingBag size={20} />
          {count} in your bag <b>{money(total)}</b>
          <ArrowRight size={18} />
        </button>
      )}
      {cartOpen && (
        <div className="modal-backdrop" onClick={() => setCartOpen(false)}>
          <section
            className="cart-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bag-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-heading">
              <h2 id="bag-title">Your good finds.</h2>
              <button
                className="icon-button"
                aria-label="Close bag"
                onClick={() => setCartOpen(false)}
              >
                <X />
              </button>
            </div>
            {count === 0 ? (
              <div className="no-results">
                <ShoppingBag />
                <p>Your next favorite is waiting.</p>
              </div>
            ) : (
              <>
                {items
                  .filter((i) => cart[i.id])
                  .map((i) => (
                    <div className="cart-line" key={i.id}>
                      <ItemArt
                        name={i.name}
                        category={i.category}
                        photoId={i.photoId}
                      />
                      <div>
                        <strong>{i.name}</strong>
                        <small>
                          {cart[i.id]} × {money(i.price)}
                        </small>
                      </div>
                      <b>{money(cart[i.id] * i.price)}</b>
                    </div>
                  ))}
                <div className="cart-total">
                  <span>Subtotal</span>
                  <strong>{money(total)}</strong>
                </div>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button primary wide"
                  onClick={checkout}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <ShoppingBag size={18} />
                  )}{" "}
                  {checkoutStarted.current && !busy
                    ? "Retry this checkout"
                    : "Continue to Square"}
                  <ArrowRight size={18} />
                </button>
                <p className="checkout-note">
                  Items are reserved for 30 minutes. Complete your payment
                  securely on Square. Any sales tax is calculated at checkout.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
