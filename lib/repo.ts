import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type {
  DraftItem,
  Item,
  Order,
  Store,
  StoreSnapshot,
  StoreBusiness,
} from "./contracts";
import { AppError } from "./server/errors";
import { credentialVersion } from "./server/auth";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const now = () => new Date().toISOString();
export function createRepo(
  path = process.env.DATABASE_PATH || "data/snap-live.sqlite",
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, store_id TEXT NOT NULL, credential_version TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS primary_stores (environment TEXT PRIMARY KEY, store_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (name TEXT PRIMARY KEY, until INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS stores (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, store_id TEXT NOT NULL REFERENCES stores(id), request_key TEXT UNIQUE NOT NULL, square_order_id TEXT UNIQUE, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS publishes (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, fingerprint TEXT NOT NULL, state TEXT NOT NULL, items TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, bytes BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, message TEXT NOT NULL, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS outbox (store_id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS google_accounts (subject TEXT NOT NULL, environment TEXT NOT NULL, store_id TEXT NOT NULL REFERENCES stores(id), PRIMARY KEY(subject, environment));
    CREATE TABLE IF NOT EXISTS oauth_tickets (hash TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS square_connections (store_id TEXT PRIMARY KEY REFERENCES stores(id), merchant_id TEXT NOT NULL, encrypted TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS items_store ON items(store_id);
    CREATE INDEX IF NOT EXISTS orders_store ON orders(store_id);`);
  function get<T>(sql: string, ...args: string[]): T | undefined {
    const row = db.prepare(sql).get(...args) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }
  function store(id: string) {
    return get<Store>("SELECT data FROM stores WHERE id=?", id);
  }
  function items(id: string): Item[] {
    return (
      db.prepare("SELECT data FROM items WHERE store_id=?").all(id) as {
        data: string;
      }[]
    ).map((r) => JSON.parse(r.data));
  }
  function orders(id: string): Order[] {
    return (
      db.prepare("SELECT data FROM orders WHERE store_id=?").all(id) as {
        data: string;
      }[]
    ).map((r) => JSON.parse(r.data));
  }
  function saveOrder(order: Order) {
    db.prepare(
      "INSERT INTO orders VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET square_order_id=excluded.square_order_id,data=excluded.data",
    ).run(
      order.id,
      order.storeId,
      order.requestKey,
      order.squareOrderId || null,
      JSON.stringify(order),
    );
  }
  function touch(id: string, message?: string) {
    const s = store(id)!;
    s.revision++;
    db.prepare("UPDATE stores SET data=? WHERE id=?").run(
      JSON.stringify(s),
      id,
    );
    db.prepare(
      "INSERT INTO outbox VALUES(?,?) ON CONFLICT(store_id) DO UPDATE SET revision=excluded.revision",
    ).run(id, s.revision);
    if (message)
      db.prepare("INSERT INTO activity VALUES(?,?,?,?)").run(
        randomUUID(),
        id,
        message,
        now(),
      );
  }
  function snapshot(id: string): StoreSnapshot {
    const s = store(id);
    if (!s) throw new AppError(404, "Store not found.");
    const allOrders = orders(id);
    const paid = allOrders.filter((o) => o.state === "paid");
    const reserved = new Map<string, number>();
    for (const o of allOrders.filter(
      (o) => o.state === "creating" || o.state === "pending",
    ))
      for (const l of o.lines)
        reserved.set(l.itemId, (reserved.get(l.itemId) || 0) + l.quantity);
    return {
      store: s,
      items: items(id).map((i) => ({
        ...i,
        available: Math.max(0, i.remaining - (reserved.get(i.id) || 0)),
      })),
      stats: {
        revenue: paid.reduce((s, o) => s + o.totalCents, 0) / 100,
        sold: paid.flatMap((o) => o.lines).reduce((s, l) => s + l.quantity, 0),
        orders: paid.length,
      },
      activity: db
        .prepare(
          "SELECT id,message,at FROM activity WHERE store_id=? ORDER BY at DESC LIMIT 12",
        )
        .all(id) as StoreSnapshot["activity"],
    };
  }
  return {
    db,
    snapshot,
    publicSnapshot(id: string): StoreSnapshot {
      const value = snapshot(id);
      return {
        ...value,
        store: { ...value.store, locationId: undefined, merchantId: undefined },
        stats: { revenue: 0, sold: 0, orders: 0 },
        activity: [],
      };
    },
    store,
    orders,
    pendingOrders() {
      return (
        db
          .prepare(
            "SELECT data FROM orders WHERE json_extract(data, '$.state') IN ('creating','pending') ORDER BY COALESCE(json_extract(data, '$.lastCheckedAt'), json_extract(data, '$.createdAt')) LIMIT 50",
          )
          .all() as { data: string }[]
      ).map((r) => JSON.parse(r.data) as Order);
    },
    createStore(
      name: string,
      mode: Store["paymentMode"] = "production",
      provider: Store["paymentProvider"] = "platform",
    ) {
      const s: Store = {
        id: randomUUID(),
        name,
        tagline: "Good finds. New beginnings.",
        createdAt: now(),
        revision: 0,
        paymentMode: mode,
        locationId:
          provider === "platform" ? process.env.SQUARE_LOCATION_ID : undefined,
        paymentProvider: provider,
      };
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO stores VALUES(?,?,?)").run(
        s.id,
        hash(token),
        JSON.stringify(s),
      );
      return { store: s, token };
    },
    primaryStore(
      environment: string,
      name: string,
      mode: Store["paymentMode"],
    ) {
      return db.transaction(() => {
        const existing = db
          .prepare("SELECT store_id FROM primary_stores WHERE environment=?")
          .get(environment) as { store_id: string } | undefined;
        if (existing) return store(existing.store_id)!;
        const created = this.createStore(name, mode).store;
        db.prepare("INSERT INTO primary_stores VALUES(?,?)").run(
          environment,
          created.id,
        );
        return created;
      })();
    },
    googleStore(subject: string, name: string, mode: Store["paymentMode"]) {
      return db.transaction(() => {
        const existing = db
          .prepare(
            "SELECT store_id FROM google_accounts WHERE subject=? AND environment=?",
          )
          .get(subject, mode) as { store_id: string } | undefined;
        if (existing) return store(existing.store_id)!;
        const created = this.createStore(name, mode, "square_oauth").store;
        db.prepare("INSERT INTO google_accounts VALUES(?,?,?)").run(
          subject,
          mode,
          created.id,
        );
        return created;
      })();
    },
    updateStore(
      id: string,
      patch: {
        locationId?: string;
        merchantId?: string;
        business?: StoreBusiness;
      },
    ) {
      return db.transaction(() => {
        const current = store(id);
        if (!current) throw new AppError(404, "Store not found.");
        db.prepare("UPDATE stores SET data=? WHERE id=?").run(
          JSON.stringify({ ...current, ...patch }),
          id,
        );
        touch(id);
        return store(id)!;
      })();
    },
    createSession(id: string, kind: "password" | "google" = "password") {
      const token = randomBytes(32).toString("hex");
      db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
        hash(token),
        id,
        kind === "google" ? "google" : credentialVersion(),
        Date.now() + 30 * 86400_000,
      );
      return token;
    },
    session(token: string) {
      const row = db
        .prepare(
          "SELECT store_id FROM sessions WHERE token_hash=? AND (credential_version=? OR (credential_version='google' AND store_id IN (SELECT store_id FROM google_accounts))) AND expires_at>?",
        )
        .get(hash(token), credentialVersion(), Date.now()) as
        { store_id: string } | undefined;
      if (!row)
        throw new AppError(401, "Please sign in to your seller account.");
      return store(row.store_id)!;
    },
    revokeSession(token: string) {
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash(token));
    },
    authorize(id: string, token: string) {
      if (this.session(token).id !== id)
        throw new AppError(403, "This store belongs to another seller.");
    },
    limit: db.transaction((key: string, maximum: number, windowMs = 60_000) => {
      const time = Date.now();
      db.prepare("DELETE FROM limits WHERE until < ?").run(time);
      const row = db
        .prepare("SELECT count FROM limits WHERE key=?")
        .get(key) as { count: number } | undefined;
      if (row && row.count >= maximum)
        throw new AppError(429, "Too many requests. Please try again later.");
      db.prepare(
        "INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
      ).run(key, time + windowMs);
    }),
    acquireJob: db.transaction((name: string, duration: number) => {
      const row = db
        .prepare("SELECT until FROM jobs WHERE name=?")
        .get(name) as { until: number } | undefined;
      if (row && row.until > Date.now()) return false;
      db.prepare(
        "INSERT INTO jobs VALUES(?,?) ON CONFLICT(name) DO UPDATE SET until=excluded.until",
      ).run(name, Date.now() + duration);
      return true;
    }),
    releaseJob(name: string) {
      db.prepare("DELETE FROM jobs WHERE name=?").run(name);
    },
    rename: db.transaction((id: string, name: string) => {
      const s = store(id);
      if (!s) throw new AppError(404, "Store not found.");
      s.name = name;
      db.prepare("UPDATE stores SET data=? WHERE id=?").run(
        JSON.stringify(s),
        id,
      );
      touch(id);
    }),
    savePhoto(id: string, bytes: Buffer) {
      const photoId = randomUUID();
      db.prepare("INSERT INTO photos VALUES(?,?,?)").run(photoId, id, bytes);
      return photoId;
    },
    photo(id: string) {
      return db
        .prepare("SELECT store_id,bytes FROM photos WHERE id=?")
        .get(id) as { store_id: string; bytes: Buffer } | undefined;
    },
    publishedPhoto(id: string) {
      const p = this.photo(id);
      return p && items(p.store_id).some((i) => i.photoId === id)
        ? p.bytes
        : undefined;
    },
    beginPublish: db.transaction(
      (id: string, key: string, drafts: DraftItem[]) => {
        const fp = hash(JSON.stringify(drafts));
        const old = db
          .prepare("SELECT * FROM publishes WHERE id=?")
          .get(key) as
          | {
              store_id: string;
              fingerprint: string;
              state: string;
              items: string;
            }
          | undefined;
        if (old) {
          if (old.store_id !== id || old.fingerprint !== fp)
            throw new AppError(
              409,
              "This publish key was already used for different items.",
            );
          return { state: old.state, items: JSON.parse(old.items) as Item[] };
        }
        const pending = db
          .prepare(
            "SELECT items FROM publishes WHERE store_id=? AND state='creating'",
          )
          .all(id) as { items: string }[];
        const claimed = new Set(
          pending.flatMap((p) =>
            (JSON.parse(p.items) as Item[]).map((i) => i.id),
          ),
        );
        if (drafts.some((d) => claimed.has(`${id}:${d.id}`)))
          throw new AppError(
            409,
            "These items have a publication in progress. Retry the original publish to confirm its result.",
          );
        for (const draft of drafts) {
          if (draft.photoId) {
            const photo = db
              .prepare("SELECT store_id FROM photos WHERE id=?")
              .get(draft.photoId) as { store_id: string } | undefined;
            if (photo?.store_id !== id)
              throw new AppError(400, "Photo does not belong to this store.");
          }
          if (
            db
              .prepare("SELECT id FROM items WHERE id=?")
              .get(`${id}:${draft.id}`)
          )
            throw new AppError(
              409,
              "These items are already published. Scan another photo to add more.",
            );
        }
        const made: Item[] = drafts.map((d) => ({
          ...d,
          id: `${id}:${d.id}`,
          storeId: id,
          remaining: d.quantity,
          available: d.quantity,
          status: "live",
          publishedAt: now(),
        }));
        db.prepare("INSERT INTO publishes VALUES(?,?,?,?,?)").run(
          key,
          id,
          fp,
          "creating",
          JSON.stringify(made),
        );
        return { state: "creating", items: made };
      },
    ),
    finishPublish: db.transaction((id: string, key: string, made: Item[]) => {
      const row = db
        .prepare("SELECT state FROM publishes WHERE id=? AND store_id=?")
        .get(key, id) as { state: string };
      if (row.state === "done") return;
      for (const item of made)
        db.prepare("INSERT INTO items VALUES(?,?,?)").run(
          item.id,
          id,
          JSON.stringify(item),
        );
      db.prepare("UPDATE publishes SET state='done',items=? WHERE id=?").run(
        JSON.stringify(made),
        key,
      );
      touch(id, `${made.length} new finds added to your store`);
    }),
    reserve: db.transaction(
      (
        id: string,
        key: string,
        lines: { itemId: string; quantity: number }[],
      ) => {
        const fp = hash(
          JSON.stringify(
            [...lines].sort((a, b) => a.itemId.localeCompare(b.itemId)),
          ),
        );
        const existing = get<Order>(
          "SELECT data FROM orders WHERE request_key=?",
          key,
        );
        if (existing) {
          if (existing.storeId !== id || existing.fingerprint !== fp)
            throw new AppError(
              409,
              "Checkout key already used for another cart.",
            );
          return existing;
        }
        const snap = snapshot(id);
        const details = lines.map((l) => {
          const item = snap.items.find((i) => i.id === l.itemId);
          if (!item || item.available < l.quantity)
            throw new AppError(
              409,
              `${item?.name || "An item"} is no longer available in that quantity. Refresh your cart.`,
            );
          return {
            itemId: item.id,
            name: item.name,
            quantity: l.quantity,
            price: item.price,
            ...(item.variationId ? { variationId: item.variationId } : {}),
          };
        });
        const subtotalCents = details.reduce(
          (sum, l) => sum + Math.round(l.price * 100) * l.quantity,
          0,
        );
        const taxPercent =
          snap.store.paymentProvider === "square_oauth"
            ? snap.store.business?.taxPercent || "0"
            : process.env.SALES_TAX_PERCENT || "0";
        const taxCents = Math.round((subtotalCents * Number(taxPercent)) / 100);
        const order: Order = {
          id: randomUUID(),
          storeId: id,
          requestKey: key,
          fingerprint: fp,
          lines: details,
          subtotalCents,
          taxPercent,
          taxCents,
          totalCents: subtotalCents + taxCents,
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          state: "creating",
          mode: snap.store.paymentMode,
          createdAt: now(),
        };
        saveOrder(order);
        touch(id);
        return order;
      },
    ),
    markChecked(id: string) {
      const value = get<Order>("SELECT data FROM orders WHERE id=?", id);
      if (value) saveOrder({ ...value, lastCheckedAt: now() });
    },
    order(id: string) {
      return get<Order>("SELECT data FROM orders WHERE id=?", id);
    },
    orderBySquare(id: string) {
      return get<Order>("SELECT data FROM orders WHERE square_order_id=?", id);
    },
    linkOrder: db.transaction(
      (
        id: string,
        link: {
          paymentUrl: string;
          linkId?: string;
          squareOrderId?: string;
          totalCents?: number;
          taxCents?: number;
        },
      ) => {
        const o = get<Order>("SELECT data FROM orders WHERE id=?", id)!;
        if (o.state === "paid" || o.state === "failed") return o;
        const updated = { ...o, ...link, state: "pending" as const };
        saveOrder(updated);
        return updated;
      },
    ),
    failOrder: db.transaction((id: string) => {
      const o = get<Order>("SELECT data FROM orders WHERE id=?", id)!;
      if (o.state !== "creating") return;
      saveOrder({ ...o, state: "failed" });
      touch(o.storeId);
    }),
    cancelOrder: db.transaction((id: string) => {
      const o = get<Order>("SELECT data FROM orders WHERE id=?", id);
      if (!o) throw new AppError(404, "Order not found.");
      if (o.state === "paid")
        throw new AppError(409, "This order is already paid.");
      if (o.state === "failed") return;
      saveOrder({ ...o, state: "failed" });
      touch(o.storeId, "Checkout canceled · items available again");
    }),
    complete: db.transaction(
      (id: string, paymentId: string, amount: number, receiptUrl?: string) => {
        const o = get<Order>("SELECT data FROM orders WHERE id=?", id);
        if (!o) throw new AppError(404, "Order not found.");
        if (o.totalCents !== amount)
          throw new AppError(400, "Payment amount does not match the order.");
        if (o.state === "paid") {
          if (o.paymentId !== paymentId)
            throw new AppError(
              409,
              "A different payment already completed this order.",
            );
          return o;
        }
        if (o.state === "failed")
          throw new AppError(409, "Order is not payable.");
        for (const line of o.lines) {
          const item = get<Item>(
            "SELECT data FROM items WHERE id=?",
            line.itemId,
          )!;
          if (item.remaining < line.quantity)
            throw new AppError(409, "Inventory reconciliation required.");
          item.remaining -= line.quantity;
          item.available = item.remaining;
          item.status = item.remaining === 0 ? "sold" : "live";
          db.prepare("UPDATE items SET data=? WHERE id=?").run(
            JSON.stringify(item),
            item.id,
          );
        }
        const paid = { ...o, state: "paid" as const, paymentId, receiptUrl };
        saveOrder(paid);
        touch(o.storeId, `Sale · ${o.lines.map((l) => l.name).join(", ")}`);
        return paid;
      },
    ),
    outbox() {
      return db
        .prepare("SELECT store_id,revision FROM outbox LIMIT 20")
        .all() as { store_id: string; revision: number }[];
    },
    synced(id: string, revision: number) {
      db.prepare("DELETE FROM outbox WHERE store_id=? AND revision<=?").run(
        id,
        revision,
      );
    },
    close() {
      db.close();
    },
  };
}
const globalRepo = globalThis as unknown as {
  snapRepo?: ReturnType<typeof createRepo>;
};
export const repo = globalRepo.snapRepo ?? (globalRepo.snapRepo = createRepo());
