import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createRepo } from "../lib/repo";
import { credentialVersion } from "../lib/server/auth";
import { fixtureItems } from "./fixtures/items";
let repo: ReturnType<typeof createRepo>;
beforeEach(() => {
  repo = createRepo(":memory:");
});
afterEach(() => repo.close());
function setup(quantity = 1) {
  const { store, token } = repo.createStore("Test store");
  const key = randomUUID();
  const { items } = repo.beginPublish(store.id, key, [
    { ...fixtureItems[0], quantity },
  ]);
  repo.finishPublish(store.id, key, items);
  return { store, token, item: items[0] };
}
describe("Inventory transactions", () => {
  it("reserves the last unit atomically and rejects a competing checkout", () => {
    const { store, item } = setup();
    repo.reserve(store.id, randomUUID(), [{ itemId: item.id, quantity: 1 }]);
    expect(repo.snapshot(store.id).items[0].available).toBe(0);
    expect(() =>
      repo.reserve(store.id, randomUUID(), [{ itemId: item.id, quantity: 1 }]),
    ).toThrow("no longer available");
    expect(repo.snapshot(store.id).items[0].remaining).toBe(1);
  });
  it("retries checkout without reserving twice; rejects changed carts", () => {
    const { store, item } = setup(3),
      key = randomUUID();
    const first = repo.reserve(store.id, key, [
      { itemId: item.id, quantity: 1 },
    ]);
    expect(
      repo.reserve(store.id, key, [{ itemId: item.id, quantity: 1 }]).id,
    ).toBe(first.id);
    expect(repo.snapshot(store.id).items[0].available).toBe(2);
    expect(() =>
      repo.reserve(store.id, key, [{ itemId: item.id, quantity: 2 }]),
    ).toThrow("another cart");
  });
  it("completes one payment exactly once, including duplicate webhook deliveries", () => {
    const { store, item } = setup(2);
    const order = repo.reserve(store.id, randomUUID(), [
      { itemId: item.id, quantity: 1 },
    ]);
    repo.complete(order.id, "payment-1", 800);
    repo.complete(order.id, "payment-1", 800);
    expect(repo.snapshot(store.id).stats).toEqual({
      revenue: 8,
      sold: 1,
      orders: 1,
    });
    expect(repo.snapshot(store.id).items[0].remaining).toBe(1);
    expect(() => repo.complete(order.id, "payment-2", 800)).toThrow(
      "different payment",
    );
  });
  it("rejects an amount mismatch without consuming inventory", () => {
    const { store, item } = setup();
    const order = repo.reserve(store.id, randomUUID(), [
      { itemId: item.id, quantity: 1 },
    ]);
    expect(() => repo.complete(order.id, "payment", 1)).toThrow("amount");
    expect(repo.snapshot(store.id).items[0].remaining).toBe(1);
  });
  it("marks sold-out items and never allows stock below zero", () => {
    const { store, item } = setup();
    const order = repo.reserve(store.id, randomUUID(), [
      { itemId: item.id, quantity: 1 },
    ]);
    repo.complete(order.id, "payment", 800);
    expect(repo.snapshot(store.id).items[0]).toMatchObject({
      remaining: 0,
      available: 0,
      status: "sold",
    });
    expect(() =>
      repo.reserve(store.id, randomUUID(), [{ itemId: item.id, quantity: 1 }]),
    ).toThrow();
  });
  it("publishes idempotently and rejects reused item identities", () => {
    const { store } = repo.createStore("Test");
    const key = randomUUID();
    const first = repo.beginPublish(store.id, key, [fixtureItems[0]]);
    repo.finishPublish(store.id, key, first.items);
    repo.finishPublish(store.id, key, first.items);
    expect(repo.snapshot(store.id).items).toHaveLength(1);
    expect(repo.beginPublish(store.id, key, [fixtureItems[0]]).state).toBe(
      "done",
    );
    expect(() =>
      repo.beginPublish(store.id, randomUUID(), [fixtureItems[0]]),
    ).toThrow("already published");
  });
  it("prevents another publish key from duplicating an uncertain catalog request", () => {
    const { store } = repo.createStore("Test");
    const firstKey = randomUUID();
    repo.beginPublish(store.id, firstKey, [fixtureItems[0]]);
    expect(() =>
      repo.beginPublish(store.id, randomUUID(), [fixtureItems[0]]),
    ).toThrow("publication in progress");
    expect(repo.beginPublish(store.id, firstKey, [fixtureItems[0]]).state).toBe(
      "creating",
    );
  });
  it("requires a valid authenticated seller session", () => {
    const { store } = setup();
    const token = repo.createSession(store.id);
    expect(() => repo.authorize(store.id, token)).not.toThrow();
    expect(() => repo.authorize(store.id, "wrong")).toThrow("sign in");
    expect(() => repo.authorize("unknown", token)).toThrow();
  });
  it("authorizes one seller session for every seller storefront only", () => {
    const a = repo.createStore("A store"),
      b = repo.createStore("B store");
    const token = repo.createSession(a.store.id);
    expect(() => repo.authorize(b.store.id, token)).not.toThrow();
    const outside = randomUUID();
    repo.db
      .prepare("INSERT INTO stores VALUES(?,?,?)")
      .run(outside, "unused", JSON.stringify({ ...a.store, id: outside }));
    expect(() => repo.authorize(outside, token)).toThrow("another seller");
    expect(() => repo.authorize(b.store.id, "wrong")).toThrow("sign in");
  });
  it("lists storefronts per Square environment in creation order", () => {
    const first = repo.primaryStore("production:", "Main", "production");
    expect(repo.primaryStore("production:", "Ignored", "production").id).toBe(
      first.id,
    );
    const key = randomUUID();
    const second = repo.addStore("production:", "Second", "production", key);
    expect(repo.addStore("production:", "Second", "production", key).id).toBe(
      second.id,
    );
    repo.createStore("Sandbox", "sandbox");
    expect(repo.sellerStores("production:").map((s) => s.name)).toEqual([
      "Main",
      "Second",
    ]);
    expect(repo.sellerStores("sandbox:").map((s) => s.name)).toEqual([
      "Sandbox",
    ]);
  });
  it("upgrades a single-store database without signing the seller out", () => {
    const path = mkdtempSync(join(tmpdir(), "snap-upgrade-"));
    const file = join(path, "legacy.sqlite");
    const legacy = new Database(file);
    legacy.exec(`CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, store_id TEXT NOT NULL, credential_version TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE primary_stores (environment TEXT PRIMARY KEY, store_id TEXT NOT NULL);
      CREATE TABLE stores (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, data TEXT NOT NULL);`);
    const store = {
      id: randomUUID(),
      name: "Existing store",
      tagline: "Good finds. New beginnings.",
      createdAt: "2026-10-01T00:00:00.000Z",
      revision: 3,
      paymentMode: "production",
      locationId: "loc",
    };
    const token = "legacy-session-token";
    legacy
      .prepare("INSERT INTO stores VALUES(?,?,?)")
      .run(store.id, "hash", JSON.stringify(store));
    legacy
      .prepare("INSERT INTO primary_stores VALUES(?,?)")
      .run("production:loc", store.id);
    legacy
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(
        createHash("sha256").update(token).digest("hex"),
        store.id,
        credentialVersion(),
        Date.now() + 60_000,
      );
    legacy.close();
    const upgraded = createRepo(file);
    expect(() => upgraded.authorize(store.id, token)).not.toThrow();
    expect(upgraded.sellerStores("production:loc")).toMatchObject([
      { id: store.id, name: "Existing store", listed: 0 },
    ]);
    upgraded.close();
    const reopened = createRepo(file);
    expect(reopened.sellerStores("production:loc")).toHaveLength(1);
    reopened.close();
    rmSync(path, { recursive: true });
  });
  it("does not let one seller publish another seller's private photo", () => {
    const a = repo.createStore("A store"),
      b = repo.createStore("B store");
    const photoId = repo.savePhoto(a.store.id, Buffer.from("image"));
    expect(repo.publishedPhoto(photoId)).toBeUndefined();
    expect(() =>
      repo.beginPublish(b.store.id, randomUUID(), [
        { ...fixtureItems[0], photoId },
      ]),
    ).toThrow("Photo does not belong");
  });
  it("persists pending orders, stock, and retry outbox across process restarts", () => {
    const path = mkdtempSync(join(tmpdir(), "snap-test-"));
    const file = join(path, "test.sqlite");
    const first = createRepo(file);
    const { store } = first.createStore("Durable");
    const key = randomUUID(),
      batch = first.beginPublish(store.id, key, [fixtureItems[0]]);
    first.finishPublish(store.id, key, batch.items);
    const order = first.reserve(store.id, randomUUID(), [
      { itemId: batch.items[0].id, quantity: 1 },
    ]);
    first.close();
    const second = createRepo(file);
    expect(second.order(order.id)?.state).toBe("creating");
    expect(second.snapshot(store.id).items[0].available).toBe(1);
    expect(second.outbox()).toHaveLength(1);
    second.close();
    rmSync(path, { recursive: true });
  });
  it("does not remove a newer unsynced snapshot when an older sync completes", () => {
    const { store, item } = setup();
    const rev = repo.snapshot(store.id).store.revision;
    repo.reserve(store.id, randomUUID(), [{ itemId: item.id, quantity: 1 }]);
    repo.synced(store.id, rev);
    expect(repo.outbox()).toHaveLength(1);
  });
});
