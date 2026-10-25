import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { repo } from "../lib/repo";
import { handle } from "../lib/server/api";
import { EditItemRequest } from "../lib/contracts";
import { fixtureItems } from "./fixtures/items";
const base = "https://store.example";
beforeEach(() => {
  for (const [key, value] of Object.entries({
    SQUARE_ENVIRONMENT: "production",
    PUBLIC_BASE_URL: base,
    SQUARE_ACCESS_TOKEN: "test-token",
    SQUARE_LOCATION_ID: "location",
    SQUARE_WEBHOOK_SIGNATURE_KEY: "test-webhook",
    BUSINESS_NAME: "Test",
    SUPPORT_EMAIL: "test@example.com",
    PICKUP_INSTRUCTIONS: "Collect here.",
    RETURN_POLICY: "Ask us.",
    SALES_TAX_PERCENT: "0",
    CONVEX_URL: "",
  }))
    vi.stubEnv(key, value);
  repo.db.exec(
    "DELETE FROM oauth_tickets; DELETE FROM google_accounts; DELETE FROM square_connections; DELETE FROM limits; DELETE FROM jobs; DELETE FROM sessions; DELETE FROM primary_stores; DELETE FROM outbox; DELETE FROM activity; DELETE FROM publishes; DELETE FROM photos; DELETE FROM orders; DELETE FROM items; DELETE FROM seller_stores; DELETE FROM convex_removals; DELETE FROM stores;",
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(() => repo.close());
function setup() {
  const { store } = repo.createStore("Test store");
  const key = randomUUID();
  const batch = repo.beginPublish(store.id, key, [
    { ...fixtureItems[0], quantity: 3 },
  ]);
  repo.finishPublish(
    store.id,
    key,
    batch.items.map((i) => ({
      ...i,
      catalogId: "catalog",
      variationId: "variation",
    })),
  );
  return {
    store,
    token: repo.createSession(store.id),
    item: repo.snapshot(store.id).items[0],
  };
}
function input(remaining = 2) {
  return EditItemRequest.parse({
    name: "Updated ceramic mug",
    description: "A revised description.",
    price: 9.5,
    condition: "Fair",
    category: "Other",
    remaining,
    expectedVersion: 0,
    requestKey: randomUUID(),
  });
}
type Setup = ReturnType<typeof setup>;
function patch(s: Setup, data: unknown, token = s.token) {
  return handle(
    new Request(
      `${base}/api/stores/${s.store.id}/items/${encodeURIComponent(s.item.id)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      },
    ),
  );
}
const catalog = () => ({
  object: {
    id: "catalog",
    type: "ITEM",
    version: 123,
    present_at_all_locations: true,
    item_data: {
      name: "Original",
      description: "Original description",
      description_html: "<p>Old</p>",
      tax_ids: ["tax"],
      variations: [
        {
          id: "variation",
          type: "ITEM_VARIATION",
          version: 123,
          item_variation_data: {
            item_id: "catalog",
            sku: "KEEP",
            track_inventory: false,
            pricing_type: "FIXED_PRICING",
            price_money: { amount: 800, currency: "USD" },
          },
        },
        {
          id: "other",
          type: "ITEM_VARIATION",
          version: 122,
          item_variation_data: { item_id: "catalog", sku: "OTHER" },
        },
      ],
    },
  },
});
function square(onPost?: () => void) {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === "GET") return Response.json(catalog());
    onPost?.();
    return Response.json({ catalog_object: { id: "catalog" } });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function reserve(s: Setup, pending = true) {
  const order = repo.reserve(s.store.id, randomUUID(), [
    { itemId: s.item.id, quantity: 1 },
  ]);
  if (pending)
    repo.linkOrder(order.id, {
      paymentUrl: "https://square.link/checkout",
      squareOrderId: "square-order",
    });
  return repo.order(order.id)!;
}
describe("Editing saved products", () => {
  it("updates the existing Square object and preserves unrelated catalog fields", async () => {
    const s = setup(),
      fetcher = square(),
      changes = input();
    const response = await patch(s, changes);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.items[0]).toMatchObject({
      name: changes.name,
      description: changes.description,
      price: 9.5,
      remaining: 2,
      category: "Other",
      condition: "Fair",
      catalogId: "catalog",
      variationId: "variation",
      editVersion: 1,
      editing: false,
    });
    const sent = JSON.parse(fetcher.mock.calls[1][1].body as string);
    expect(sent.idempotency_key).toBe(changes.requestKey);
    expect(sent.object.version).toBe(123);
    expect(sent.object.item_data.tax_ids).toEqual(["tax"]);
    expect(sent.object.item_data.description_html).toBeUndefined();
    expect(sent.object.item_data.variations[0]).toMatchObject({
      version: 123,
      item_variation_data: {
        sku: "KEEP",
        track_inventory: false,
        price_money: { amount: 950, currency: "USD" },
      },
    });
    expect(sent.object.item_data.variations[1]).toEqual(
      catalog().object.item_data.variations[1],
    );
    const next = repo.reserve(s.store.id, randomUUID(), [
      { itemId: s.item.id, quantity: 1 },
    ]);
    expect(next.lines[0].price).toBe(9.5);
    expect(repo.publicSnapshot(s.store.id).items[0].name).toBe(changes.name);
  });
  it("requires ownership and rejects invalid money before contacting Square", async () => {
    const s = setup(),
      fetcher = square();
    expect((await patch(s, input(), "bad-session")).status).toBe(401);
    const other = repo.googleStore(
      "another-seller",
      "Other store",
      "production",
    );
    expect(
      (await patch(s, input(), repo.createSession(other.id, "google"))).status,
    ).toBe(403);
    expect((await patch(s, { ...input(), price: 2.345 })).status).toBe(400);
    expect((await patch(s, { ...input(), remaining: -1 })).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("protects reserved stock while retaining the price of existing checkouts", async () => {
    const s = setup(),
      order = reserve(s),
      fetcher = square();
    expect((await patch(s, input(0))).status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await patch(s, input(1))).status).toBe(200);
    expect(repo.order(order.id)!.lines).toEqual(order.lines);
    expect(repo.order(order.id)!.totalCents).toBe(order.totalCents);
    expect(repo.snapshot(s.store.id).items[0].available).toBe(0);
  });
  it("does not restore stock sold during a save", async () => {
    const s = setup(),
      order = reserve(s);
    square(() => repo.complete(order.id, "payment", order.totalCents));
    expect((await patch(s, input(2))).status).toBe(200);
    expect(repo.snapshot(s.store.id).items[0]).toMatchObject({
      remaining: 1,
      available: 1,
      price: 9.5,
      editVersion: 2,
    });
    expect(repo.snapshot(s.store.id).stats.sold).toBe(1);
  });
  it("persists an uncertain save and retries the exact Square request without taking extra stock", async () => {
    const s = setup(),
      changes = input(2);
    let failed = false;
    const fetcher = square(() => {
      if (!failed) {
        failed = true;
        throw new Error("connection interrupted");
      }
    });
    expect((await patch(s, changes)).status).toBe(500);
    expect(repo.snapshot(s.store.id).items[0].pendingEdit).toEqual(changes);
    expect(
      repo.publicSnapshot(s.store.id).items[0].pendingEdit,
    ).toBeUndefined();
    expect(() =>
      repo.reserve(s.store.id, randomUUID(), [
        { itemId: s.item.id, quantity: 1 },
      ]),
    ).toThrow("being updated");
    expect(() => repo.closeStore(s.store.id)).toThrow("Finish saving");
    expect((await patch(s, input())).status).toBe(409);
    expect((await patch(s, changes)).status).toBe(200);
    expect(
      fetcher.mock.calls.filter((c) => c[1].method === "GET"),
    ).toHaveLength(1);
    const posts = fetcher.mock.calls.filter((c) => c[1].method === "POST");
    expect(posts[0][1].body).toBe(posts[1][1].body);
    expect((await patch(s, changes)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(repo.snapshot(s.store.id).items[0].remaining).toBe(2);
  });
  it("rejects stale forms and edits while checkout creation is unresolved", async () => {
    const s = setup(),
      fetcher = square();
    const order = reserve(s, false);
    expect((await patch(s, input())).status).toBe(409);
    repo.failOrder(order.id);
    expect((await patch(s, input())).status).toBe(200);
    expect((await patch(s, input())).status).toBe(409);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("marks zero stock sold out and supports replenishing it", async () => {
    const s = setup();
    square();
    expect((await patch(s, input(0))).status).toBe(200);
    expect(repo.snapshot(s.store.id).items[0]).toMatchObject({
      status: "sold",
      remaining: 0,
    });
    expect((await patch(s, { ...input(3), expectedVersion: 1 })).status).toBe(
      200,
    );
    expect(repo.snapshot(s.store.id).items[0]).toMatchObject({
      status: "live",
      remaining: 3,
      available: 3,
    });
  });
});
