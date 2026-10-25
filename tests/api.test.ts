import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID, createHmac, scryptSync } from "node:crypto";
import { fixtureItems } from "./fixtures/items";
let handle: (r: Request) => Promise<Response>;
let repo: typeof import("../lib/repo").repo;
const url = "https://snap.example";
const salt = "a".repeat(32);
const passwordHash = `scrypt:${salt}:${scryptSync("long-test-password", salt, 64).toString("hex")}`;
beforeAll(async () => {
  vi.stubEnv("DATABASE_PATH", ":memory:");
  ({ handle } = await import("../lib/server/api"));
  ({ repo } = await import("../lib/repo"));
});
beforeEach(() => {
  for (const [k, v] of Object.entries({
    SQUARE_ENVIRONMENT: "production",
    PUBLIC_BASE_URL: url,
    SQUARE_LOCATION_ID: "loc",
    SQUARE_ACCESS_TOKEN: "token",
    SQUARE_WEBHOOK_SIGNATURE_KEY: "secret",
    BUSINESS_NAME: "Real store",
    SUPPORT_EMAIL: "shop@example.com",
    PICKUP_INSTRUCTIONS: "Collect at the shop.",
    RETURN_POLICY: "Contact us within 14 days.",
    SALES_TAX_PERCENT: "0",
    SELLER_EMAIL: "seller@example.com",
    SELLER_PASSWORD_HASH: passwordHash,
    MAINTENANCE_SECRET: "maintenance-test-secret",
  }))
    vi.stubEnv(k, v);
  repo.db.exec(
    "DELETE FROM limits; DELETE FROM jobs; DELETE FROM sessions; DELETE FROM primary_stores; DELETE FROM outbox; DELETE FROM activity; DELETE FROM publishes; DELETE FROM photos; DELETE FROM orders; DELETE FROM items; DELETE FROM seller_stores; DELETE FROM convex_removals; DELETE FROM stores;",
  );
});
afterAll(() => {
  repo.close();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
async function call(
  path: string,
  body?: unknown,
  token?: string,
  headers: Record<string, string> = {},
) {
  return handle(
    new Request(url + "/api" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
function setup() {
  const { store } = repo.createStore("Boundary test");
  const token = repo.createSession(store.id);
  const key = randomUUID(),
    batch = repo.beginPublish(store.id, key, [fixtureItems[1]]);
  repo.finishPublish(store.id, key, batch.items);
  return { store, token, item: batch.items[0] };
}
function reserve() {
  const s = setup();
  const order = repo.reserve(s.store.id, randomUUID(), [
    { itemId: s.item.id, quantity: 1 },
  ]);
  repo.linkOrder(order.id, {
    paymentUrl: "https://square.link/checkout",
    linkId: `link-${order.id}`,
    squareOrderId: `sq-${order.id}`,
  });
  return { ...s, order: repo.order(order.id)! };
}
function payment(order: ReturnType<typeof reserve>["order"]) {
  return {
    id: `pay-${order.id}`,
    status: "COMPLETED",
    location_id: "loc",
    order_id: order.squareOrderId,
    amount_money: { amount: order.totalCents, currency: "USD" },
  };
}
async function webhook(value: unknown, signature?: string) {
  const raw = JSON.stringify({
    type: "payment.updated",
    data: { object: { payment: value } },
  });
  return handle(
    new Request(url + "/api/webhooks/square", {
      method: "POST",
      body: raw,
      headers: {
        "x-square-hmacsha256-signature":
          signature ??
          createHmac("sha256", "secret")
            .update(url + "/api/webhooks/square" + raw)
            .digest("base64"),
      },
    }),
  );
}
describe("production HTTP boundaries", () => {
  it("rejects foreign origins and cross-site credential requests", async () => {
    expect(
      (
        await call("/auth/login", {}, undefined, {
          Origin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("/auth/logout", {}, undefined, {
          "sec-fetch-site": "cross-site",
        })
      ).status,
    ).toBe(403);
  });
  it("removes public seller creation and sample endpoints", async () => {
    expect(
      (await call("/stores", { name: "Nope", requestKey: randomUUID() }))
        .status,
    ).toBe(401);
    expect((await call("/stores")).status).toBe(401);
    expect(repo.db.prepare("SELECT COUNT(*) AS n FROM stores").get()).toEqual({
      n: 0,
    });
    expect((await call("/sample", {})).status).toBe(404);
    const { order } = reserve();
    expect((await call(`/orders/${order.id}/demo-complete`, {})).status).toBe(
      404,
    );
  });
  it("signs in to the same merchant store, sets secure cookie, and revokes logout", async () => {
    expect(
      (
        await call("/auth/login", {
          email: "seller@example.com",
          password: "wrong",
        })
      ).status,
    ).toBe(401);
    const r = await call("/auth/login", {
      email: "seller@example.com",
      password: "long-test-password",
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    expect(r.headers.get("set-cookie")).toContain("Secure");
    const first = await r.json();
    const second = await (
      await call("/auth/login", {
        email: "seller@example.com",
        password: "long-test-password",
      })
    ).json();
    expect(first.store.id).toBe(second.store.id);
    expect(first.token).not.toBe(second.token);
    expect(
      (
        await call("/auth/session", undefined, undefined, {
          Cookie: `snap_owner=${first.token}`,
        })
      ).status,
    ).toBe(200);
    expect((await call("/auth/logout", {}, first.token)).status).toBe(200);
    expect((await call("/auth/session", undefined, first.token)).status).toBe(
      401,
    );
    expect((await call("/auth/session", undefined, second.token)).status).toBe(
      200,
    );
  });
  it("revokes sessions after a password rotation", async () => {
    const { token } = setup();
    vi.stubEnv("SELLER_PASSWORD_HASH", passwordHash + "changed");
    expect((await call("/auth/session", undefined, token)).status).toBe(401);
  });
  it("locks out repeated password guesses with durable rate limiting", async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (
          await call("/auth/login", {
            email: "seller@example.com",
            password: "wrong",
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await call("/auth/login", {
          email: "seller@example.com",
          password: "wrong",
        })
      ).status,
    ).toBe(429);
  });
  it("returns no seller credentials or private draft photos to anonymous users", async () => {
    const { store, token } = setup();
    const id = repo.savePhoto(store.id, Buffer.from("private"));
    expect((await call(`/photos/${id}`)).status).toBe(404);
    expect((await call(`/photos/${id}`, undefined, token)).status).toBe(200);
    const text = await (await call(`/stores/${store.id}`)).text();
    expect(text).not.toContain(token);
    expect(text).not.toContain("token_hash");
  });
  it("blocks legacy sample stores instead of charging for invented listings", async () => {
    const { store } = setup();
    repo.db
      .prepare("UPDATE stores SET data=? WHERE id=?")
      .run(JSON.stringify({ ...store, paymentMode: "demo" }), store.id);
    expect((await call(`/stores/${store.id}`)).status).toBe(410);
  });
  it("rejects a store after a Square location change", async () => {
    const { store } = setup();
    vi.stubEnv("SQUARE_LOCATION_ID", "different");
    expect((await call(`/stores/${store.id}`)).status).toBe(410);
  });
  it("rejects malformed login JSON and authenticates before uploads", async () => {
    expect(
      (
        await handle(
          new Request(url + "/api/auth/login", { method: "POST", body: "{" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await call("/scan?storeId=unknown", { photo: "fake" })).status,
    ).toBe(401);
    const { store, token } = setup();
    expect(
      (await call(`/scan?storeId=${store.id}`, { photo: "fake" }, token))
        .status,
    ).toBe(400);
  });
  it("fails closed before reserving stock if production checkout lacks HTTPS", async () => {
    const { store, item } = setup();
    vi.stubEnv("PUBLIC_BASE_URL", "http://172.20.1.172:3000");
    expect(
      (
        await call("/checkout", {
          storeId: store.id,
          requestKey: randomUUID(),
          lines: [{ itemId: item.id, quantity: 1 }],
        })
      ).status,
    ).toBe(503);
    expect(repo.snapshot(store.id).items[0].available).toBe(1);
  });
  it("creates a real Square link and retries without creating a second reservation", async () => {
    const { store, item } = setup();
    const body = {
      storeId: store.id,
      requestKey: randomUUID(),
      lines: [{ itemId: item.id, quantity: 1 }],
    };
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        payment_link: {
          id: "link",
          url: "https://square.link/real",
          order_id: randomUUID(),
        },
        related_resources: {
          orders: [
            {
              total_money: { amount: 2800, currency: "USD" },
              total_tax_money: { amount: 0 },
            },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const a = await (await call("/checkout", body)).json(),
      b = await (await call("/checkout", body)).json();
    expect(a.url).toBe("https://square.link/real");
    expect(a.orderId).toBe(b.orderId);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain(
      "https://connect.squareup.com/",
    );
    expect(repo.snapshot(store.id).stats.sold).toBe(0);
  });
  it("keeps stock held after a network timeout until a safe retry", async () => {
    const { store, item } = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network failure")),
    );
    expect(
      (
        await call("/checkout", {
          storeId: store.id,
          requestKey: randomUUID(),
          lines: [{ itemId: item.id, quantity: 1 }],
        })
      ).status,
    ).toBe(500);
    expect(repo.snapshot(store.id).items[0].available).toBe(0);
  });
  it("verifies webhook signature, location, currency and amount; duplicate delivery is idempotent", async () => {
    const { store, order } = reserve(),
      p = payment(order);
    expect((await webhook(p, "forged")).status).toBe(401);
    expect(
      (await webhook({ ...p, amount_money: { amount: 1, currency: "USD" } }))
        .status,
    ).toBe(400);
    expect((await webhook({ ...p, location_id: "other" })).status).toBe(400);
    expect(
      (await webhook({ ...p, amount_money: { amount: 2800, currency: "EUR" } }))
        .status,
    ).toBe(400);
    expect((await webhook(p)).status).toBe(200);
    expect((await webhook(p)).status).toBe(200);
    expect(repo.snapshot(store.id).stats).toEqual({
      sold: 1,
      revenue: 28,
      orders: 1,
    });
  });
  it("requests webhook redelivery when payment races checkout persistence", async () => {
    const { store, item } = setup(),
      order = repo.reserve(store.id, randomUUID(), [
        { itemId: item.id, quantity: 1 },
      ]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ order: { reference_id: order.id } }),
        ),
    );
    expect(
      (await webhook({ ...payment(order), order_id: "not-linked-yet" })).status,
    ).toBe(503);
    expect(repo.order(order.id)?.state).toBe("creating");
  });
  it("reconciles a missed webhook from authenticated Square responses", async () => {
    const { order, store } = reserve();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            order: { state: "COMPLETED", tenders: [{ payment_id: "payment" }] },
          }),
        )
        .mockResolvedValueOnce(Response.json({ payment: payment(order) })),
    );
    const r = await call(`/orders/${order.id}`);
    expect((await r.json()).state).toBe("paid");
    expect(repo.snapshot(store.id).stats.sold).toBe(1);
  });
  it("never releases inventory until Square confirms an unpaid cancellation", async () => {
    const { order, store } = reserve();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({}))
        .mockResolvedValueOnce(
          Response.json({ order: { state: "OPEN", tenders: [] } }),
        ),
    );
    expect((await call(`/orders/${order.id}/cancel`, {})).status).toBe(409);
    expect(repo.snapshot(store.id).items[0].available).toBe(0);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({}, { status: 404 }))
        .mockResolvedValueOnce(
          Response.json({ order: { state: "CANCELED", tenders: [] } }),
        ),
    );
    expect((await call(`/orders/${order.id}/cancel`, {})).status).toBe(200);
    expect(repo.snapshot(store.id).items[0].available).toBe(1);
  });
  it("expires abandoned holds only after Square confirms cancellation", async () => {
    const { order, store } = reserve();
    repo.db
      .prepare("UPDATE orders SET data=? WHERE id=?")
      .run(
        JSON.stringify({
          ...order,
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
        order.id,
      );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({}))
        .mockResolvedValueOnce(
          Response.json({ order: { state: "CANCELED", tenders: [] } }),
        ),
    );
    const response = await call("/maintenance", {}, "maintenance-test-secret");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ checked: 1, failed: 0 });
    expect(repo.snapshot(store.id).items[0].available).toBe(1);
    expect(repo.snapshot(store.id).stats.orders).toBe(0);
  });
  it("stores Square's final tax total and requires that exact payment amount", async () => {
    vi.stubEnv("SALES_TAX_PERCENT", "8.625");
    const { store, item } = setup();
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          payment_link: {
            id: "tax-link",
            url: "https://square.link/tax",
            order_id: "tax-order",
          },
          related_resources: {
            orders: [
              {
                total_money: { amount: 3042, currency: "USD" },
                total_tax_money: { amount: 242 },
              },
            ],
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const response = await call("/checkout", {
      storeId: store.id,
      requestKey: randomUUID(),
      lines: [{ itemId: item.id, quantity: 1 }],
    });
    expect(response.status).toBe(200);
    const order = repo.order((await response.json()).orderId)!;
    expect(order.taxCents).toBe(242);
    expect(order.totalCents).toBe(3042);
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.order.taxes[0].percentage).toBe("8.625");
    expect(() => repo.complete(order.id, "tax-payment", 2800)).toThrow(
      "amount",
    );
    expect(repo.complete(order.id, "tax-payment", 3042).state).toBe("paid");
  });
  it("protects background maintenance with its own secret", async () => {
    expect((await call("/maintenance", {})).status).toBe(401);
    expect((await call("/maintenance", {}, "wrong")).status).toBe(401);
  });
});
describe("multiple storefronts", () => {
  async function login() {
    return (
      await call("/auth/login", {
        email: "seller@example.com",
        password: "long-test-password",
      })
    ).json();
  }
  async function open(token: string, name: string, requestKey = randomUUID()) {
    return call("/stores", { name, requestKey }, token);
  }
  async function remove(token: string | undefined, id: string, name: string) {
    return handle(
      new Request(`${url}/api/stores/${id}`, {
        method: "DELETE",
        headers: token ? { authorization: `Bearer ${token}` } : {},
        body: JSON.stringify({ name }),
      }),
    );
  }
  function publishTo(storeId: string, catalogId = `cat-${randomUUID()}`) {
    const key = randomUUID();
    const batch = repo.beginPublish(storeId, key, [fixtureItems[1]]);
    repo.finishPublish(
      storeId,
      key,
      batch.items.map((i) => ({
        ...i,
        catalogId,
        variationId: `var-${catalogId}`,
      })),
    );
    return { ...batch.items[0], catalogId };
  }
  const rows = (table: string, storeId: string) =>
    (
      repo.db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE store_id=?`)
        .get(storeId) as { n: number }
    ).n;
  it("lets one seller sign-in open, list, and manage several storefronts", async () => {
    const session = await login();
    // Older app builds save the whole login response in SecureStore; keep it small.
    expect(Object.keys(session).sort()).toEqual(["store", "token"]);
    const initial = await (
      await call("/stores", undefined, session.token)
    ).json();
    expect(initial.stores.map((s: { id: string }) => s.id)).toEqual([
      session.store.id,
    ]);
    const response = await open(session.token, "Garage sale");
    expect(response.status).toBe(200);
    const { store, stores } = await response.json();
    expect(store).toMatchObject({
      name: "Garage sale",
      paymentMode: "production",
    });
    expect(stores.map((s: { id: string }) => s.id)).toEqual([
      session.store.id,
      store.id,
    ]);
    expect(stores[1]).toMatchObject({ listed: 0, available: 0 });
    const listed = await (
      await call("/stores", undefined, session.token)
    ).json();
    expect(listed.stores).toHaveLength(2);
    const restored = await (
      await call("/auth/session", undefined, session.token)
    ).json();
    expect(restored.store.id).toBe(session.store.id);
    expect(restored.stores).toHaveLength(2);
    const renamed = await handle(
      new Request(`${url}/api/stores/${store.id}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ name: "Spring garage sale" }),
      }),
    );
    expect(renamed.status).toBe(200);
    expect(repo.store(store.id)?.name).toBe("Spring garage sale");
    expect(repo.store(session.store.id)?.name).toBe("Real store");
    expect(
      (
        await call(
          `/scan?storeId=${store.id}`,
          { photo: "fake" },
          session.token,
        )
      ).status,
    ).toBe(400);
  });
  it("creates each storefront once per request key and caps the total", async () => {
    const { token } = await login();
    const requestKey = randomUUID();
    const first = await (await open(token, "Book table", requestKey)).json();
    const retry = await (await open(token, "Book table", requestKey)).json();
    expect(retry.store.id).toBe(first.store.id);
    expect(retry.stores).toHaveLength(2);
    expect((await open(token, "x")).status).toBe(400);
    expect(
      (await call("/stores", { name: "No key", requestKey: "1" }, token))
        .status,
    ).toBe(400);
    for (let n = 3; n <= 20; n++)
      expect((await open(token, `Table ${n}`)).status).toBe(200);
    const over = await open(token, "One too many");
    expect(over.status).toBe(409);
    expect((await over.json()).error).toContain("up to 20 storefronts");
  });
  it("keeps inventory, checkout, and stats separate per storefront", async () => {
    const session = await login();
    const second = (await (await open(session.token, "Second")).json()).store;
    const publish = (storeId: string, item = fixtureItems[1]) => {
      const key = randomUUID();
      const batch = repo.beginPublish(storeId, key, [item]);
      repo.finishPublish(storeId, key, batch.items);
      return batch.items[0];
    };
    const lamp = publish(session.store.id);
    const sameDraftElsewhere = publish(second.id);
    expect(sameDraftElsewhere.id).not.toBe(lamp.id);
    expect(repo.snapshot(session.store.id).items.map((i) => i.id)).toEqual([
      lamp.id,
    ]);
    expect(() =>
      repo.reserve(second.id, randomUUID(), [{ itemId: lamp.id, quantity: 1 }]),
    ).toThrow("no longer available");
    const order = repo.reserve(second.id, randomUUID(), [
      { itemId: sameDraftElsewhere.id, quantity: 1 },
    ]);
    repo.complete(order.id, "pay-second", order.totalCents);
    expect(repo.snapshot(second.id).stats.sold).toBe(1);
    expect(repo.snapshot(session.store.id).stats.sold).toBe(0);
    const { stores } = await (
      await call("/stores", undefined, session.token)
    ).json();
    expect(stores).toMatchObject([
      { id: session.store.id, listed: 1, available: 1 },
      { id: second.id, listed: 1, available: 0 },
    ]);
  });
  it("applies the paid scan limit to the seller, not each storefront", async () => {
    const session = await login();
    const second = (await (await open(session.token, "Second")).json()).store;
    for (let n = 0; n < 6; n++)
      expect(
        (
          await call(
            `/scan?storeId=${n % 2 ? second.id : session.store.id}`,
            { photo: "fake" },
            session.token,
          )
        ).status,
      ).toBe(400);
    expect(
      (
        await call(
          `/scan?storeId=${second.id}`,
          { photo: "fake" },
          session.token,
        )
      ).status,
    ).toBe(429);
  });
  it("deletes a storefront completely, including its Square catalog items", async () => {
    const session = await login();
    const second = (await (await open(session.token, "Garage sale")).json())
      .store;
    const item = publishTo(second.id);
    const kept = publishTo(session.store.id);
    const photo = repo.savePhoto(second.id, Buffer.from("photo"));
    const sale = repo.reserve(second.id, randomUUID(), [
      { itemId: item.id, quantity: 1 },
    ]);
    repo.complete(sale.id, "pay-old", sale.totalCents);
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ deleted_object_ids: [] }));
    vi.stubGlobal("fetch", fetch);
    expect((await remove(undefined, second.id, "Garage sale")).status).toBe(
      401,
    );
    const wrong = await remove(session.token, second.id, "garage sale");
    expect(wrong.status).toBe(400);
    expect(repo.store(second.id)?.closing).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    const response = await remove(session.token, second.id, "Garage sale");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.deleted).toBe(second.id);
    expect(result.store.id).toBe(session.store.id);
    expect(result.stores.map((s: { id: string }) => s.id)).toEqual([
      session.store.id,
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain(
      "/v2/catalog/batch-delete",
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      object_ids: [item.catalogId],
    });
    expect(repo.store(second.id)).toBeUndefined();
    for (const table of [
      "items",
      "orders",
      "photos",
      "activity",
      "publishes",
      "outbox",
      "seller_stores",
    ])
      expect(rows(table, second.id)).toBe(0);
    expect(repo.convexRemovals()).toEqual([second.id]);
    expect((await call(`/stores/${second.id}`)).status).toBe(404);
    expect(
      (await call(`/photos/${photo}`, undefined, session.token)).status,
    ).toBe(404);
    expect((await call(`/orders/${sale.id}`)).status).toBe(404);
    expect(
      (
        await call("/checkout", {
          storeId: second.id,
          requestKey: randomUUID(),
          lines: [{ itemId: item.id, quantity: 1 }],
        })
      ).status,
    ).toBe(404);
    // The other storefront is untouched.
    expect(repo.snapshot(session.store.id).items.map((i) => i.id)).toEqual([
      kept.id,
    ]);
    expect((await remove(session.token, second.id, "Garage sale")).status).toBe(
      404,
    );
  });
  it("refuses to delete a storefront while a buyer's checkout is open", async () => {
    const session = await login();
    const second = (await (await open(session.token, "Busy table")).json())
      .store;
    const item = publishTo(second.id);
    const order = repo.reserve(second.id, randomUUID(), [
      { itemId: item.id, quantity: 1 },
    ]);
    const fetch = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetch);
    const blocked = await remove(session.token, second.id, "Busy table");
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toContain("checkout open");
    expect(fetch).not.toHaveBeenCalled();
    expect(repo.store(second.id)?.closing).toBeUndefined();
    expect(repo.snapshot(second.id).items[0].available).toBe(0);
    repo.cancelOrder(order.id);
    expect((await remove(session.token, second.id, "Busy table")).status).toBe(
      200,
    );
  });
  it("keeps a storefront closed to buyers and retryable when Square deletion fails", async () => {
    const session = await login();
    const second = (await (await open(session.token, "Flaky")).json()).store;
    const item = publishTo(second.id);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({}, { status: 500 })),
    );
    expect((await remove(session.token, second.id, "Flaky")).status).toBe(502);
    expect(repo.store(second.id)?.closing).toBe(true);
    expect(rows("items", second.id)).toBe(1);
    expect(
      (
        await call("/checkout", {
          storeId: second.id,
          requestKey: randomUUID(),
          lines: [{ itemId: item.id, quantity: 1 }],
        })
      ).status,
    ).toBe(409);
    expect(() =>
      repo.beginPublish(second.id, randomUUID(), [fixtureItems[0]]),
    ).toThrow("being deleted");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ deleted_object_ids: [] })),
    );
    expect((await remove(session.token, second.id, "Flaky")).status).toBe(200);
    expect(repo.store(second.id)).toBeUndefined();
  });
  it("replays an unfinished publish so its Square items are deleted too", async () => {
    const session = await login();
    const second = (await (await open(session.token, "Half done")).json())
      .store;
    const key = randomUUID();
    repo.beginPublish(second.id, key, [fixtureItems[1]]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id_mappings: [
            { client_object_id: "#item-0", object_id: "orphan-item" },
            { client_object_id: "#variation-0", object_id: "orphan-var" },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ deleted_object_ids: [] }));
    vi.stubGlobal("fetch", fetch);
    expect((await remove(session.token, second.id, "Half done")).status).toBe(
      200,
    );
    expect(String(fetch.mock.calls[0][0])).toContain("/catalog/batch-upsert");
    expect(JSON.parse(fetch.mock.calls[0][1].body).idempotency_key).toBe(key);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      object_ids: ["orphan-item"],
    });
  });
  it("promotes another storefront when the primary one is deleted", async () => {
    const session = await login();
    const second = (await (await open(session.token, "Second")).json()).store;
    const response = await remove(
      session.token,
      session.store.id,
      "Real store",
    );
    expect(response.status).toBe(200);
    expect((await response.json()).store.id).toBe(second.id);
    const restored = await (
      await call("/auth/session", undefined, session.token)
    ).json();
    expect(restored.store.id).toBe(second.id);
    expect(restored.stores).toHaveLength(1);
    // Sessions keep pointing at a real storefront for rollback compatibility.
    expect(
      repo.db.prepare("SELECT DISTINCT store_id FROM sessions").all(),
    ).toEqual([{ store_id: second.id }]);
    const again = await (await login()).store;
    expect(again.id).toBe(second.id);
  });
  it("opens a fresh empty storefront when the only one is deleted", async () => {
    const session = await login();
    publishTo(session.store.id);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ deleted_object_ids: [] })),
    );
    const response = await remove(
      session.token,
      session.store.id,
      "Real store",
    );
    expect(response.status).toBe(200);
    const { store, stores } = await response.json();
    expect(store.id).not.toBe(session.store.id);
    expect(store).toMatchObject({ name: "Real store", revision: 0 });
    expect(stores).toMatchObject([{ id: store.id, listed: 0 }]);
    expect((await call("/stores", undefined, session.token)).status).toBe(200);
    expect(repo.store(session.store.id)).toBeUndefined();
  });
  it("scopes storefronts to the configured Square location", async () => {
    const session = await login();
    const second = (await (await open(session.token, "Second")).json()).store;
    vi.stubEnv("SQUARE_LOCATION_ID", "new-location");
    const moved = await (
      await call("/auth/session", undefined, session.token)
    ).json();
    expect(moved.store.id).not.toBe(session.store.id);
    expect(moved.stores.map((s: { id: string }) => s.id)).toEqual([
      moved.store.id,
    ]);
    expect(
      (await call(`/stores/${second.id}`, undefined, session.token)).status,
    ).toBe(410);
  });
});
