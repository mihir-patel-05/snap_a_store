import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { fixtureItems } from "./fixtures/items";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));
let handle: (r: Request) => Promise<Response>;
let repo: typeof import("../lib/repo").repo;
let scanPhoto: typeof import("../lib/providers/vision").scanPhoto;
let normalizeBox: typeof import("../lib/providers/vision").normalizeBox;
let listingProblem: typeof import("../lib/providers/listing").listingProblem;
const url = "https://snap.example";
beforeAll(async () => {
  vi.stubEnv("DATABASE_PATH", ":memory:");
  ({ handle } = await import("../lib/server/api"));
  ({ repo } = await import("../lib/repo"));
  ({ scanPhoto, normalizeBox } = await import("../lib/providers/vision"));
  ({ listingProblem } = await import("../lib/providers/listing"));
});
beforeEach(() => {
  for (const [k, v] of Object.entries({
    SQUARE_ENVIRONMENT: "production",
    PUBLIC_BASE_URL: url,
    SQUARE_LOCATION_ID: "loc",
    ANTHROPIC_API_KEY: "test-key",
  }))
    vi.stubEnv(k, v);
  repo.db.exec(
    "DELETE FROM listing_kits; DELETE FROM facebook_holds; DELETE FROM offline_sales; DELETE FROM limits; DELETE FROM sessions; DELETE FROM outbox; DELETE FROM activity; DELETE FROM publishes; DELETE FROM photos; DELETE FROM orders; DELETE FROM items; DELETE FROM seller_stores; DELETE FROM stores;",
  );
});
afterEach(() => create.mockReset());
afterAll(() => {
  repo.close();
  vi.unstubAllEnvs();
});
async function call(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
) {
  return handle(
    new Request(url + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
// An 800×600 photo with EXIF metadata, like one straight from a phone.
const photo = () =>
  sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 200, g: 180, b: 160 },
    },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "Seller's phone" } } })
    .toBuffer();
async function setup(item = fixtureItems[0]) {
  const { store } = repo.createStore("Marketplace test");
  const token = repo.createSession(store.id);
  const photoId = repo.savePhoto(store.id, await photo());
  const key = randomUUID();
  const batch = repo.beginPublish(store.id, key, [
    { ...item, photoId, box: { x: 0.5, y: 0.25, w: 0.25, h: 0.5 } },
  ]);
  repo.finishPublish(store.id, key, batch.items);
  const published = batch.items[0];
  const base = `/stores/${store.id}/items/${encodeURIComponent(published.id)}`;
  return { store, token, item: published, base };
}
const reply = (copy: Record<string, unknown>) => ({
  stop_reason: "end_turn",
  content: [
    {
      type: "text",
      text: JSON.stringify({
        title: "Blue ceramic mug with large handle",
        description:
          "Glazed blue ceramic mug with a generous handle. Pickup only; message me if it's still listed.",
        category: "Kitchen & Dining",
        tags: ["mug", "ceramic"],
        warnings: ["Check the rim for chips before posting."],
        ...copy,
      }),
    },
  ],
});

describe("Facebook Marketplace listing kit", () => {
  it("writes a kit for the store owner using the published price and a cropped photo", async () => {
    const { store, token, item, base } = await setup();
    create.mockResolvedValue(reply({}));
    expect((await call("POST", `${base}/listing`, {})).status).toBe(401);
    const other = repo.createStore("Someone else's store");
    expect(
      (
        await call(
          "POST",
          `${base}/listing`,
          {},
          repo.createSession(other.store.id),
        )
      ).status,
    ).toBe(403);
    expect(create).not.toHaveBeenCalled();
    const response = await call("POST", `${base}/listing`, {}, token);
    expect(response.status).toBe(200);
    const kit = await response.json();
    expect(kit).toMatchObject({
      itemId: item.id,
      title: "Blue ceramic mug with large handle",
      category: "Kitchen & Dining",
      condition: "Used – Good",
      price: 8,
      crop: { x: 0.5, y: 0.25, w: 0.25, h: 0.5 },
      status: "draft",
      warnings: ["Check the rim for chips before posting."],
    });
    const params = create.mock.calls[0][0];
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.tool_choice).toBeUndefined();
    expect(params.messages[0].content[0].type).toBe("image");
    expect(params.messages[0].content[1].text).toContain("Blue ceramic mug");
    // Saved: reading it back costs no model call.
    const saved = await call("GET", `${base}/listing`, undefined, token);
    expect(await saved.json()).toMatchObject({ title: kit.title, price: 8 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      (
        await call(
          "GET",
          `/stores/${store.id}/items/missing/listing`,
          undefined,
          token,
        )
      ).status,
    ).toBe(404);
  });
  it("rejects copy with a price, link, or contact details, retrying once", async () => {
    const { token, base } = await setup();
    create
      .mockResolvedValueOnce(reply({ description: "Great mug, only $20 OBO." }))
      .mockResolvedValueOnce(
        reply({ description: "Call 415-555-0134 today." }),
      );
    const failed = await call("POST", `${base}/listing`, {}, token);
    expect(failed.status).toBe(502);
    expect(create).toHaveBeenCalledTimes(2);
    expect(
      (await call("GET", `${base}/listing`, undefined, token)).status,
    ).toBe(404);
    create
      .mockResolvedValueOnce(reply({ title: "Mug — see shop.example.com" }))
      .mockResolvedValueOnce(reply({}));
    expect((await call("POST", `${base}/listing`, {}, token)).status).toBe(200);
    expect(
      listingProblem({
        title: "Mug",
        description: "Yours for 15 dollars please",
        category: "Household",
        tags: [],
      }),
    ).toBe("mentions a price");
    expect(
      listingProblem({
        title: "Mug",
        description: "Email me at a@b.co for details",
        category: "Household",
        tags: [],
      }),
    ).toBe("includes a link or contact details");
    expect(
      listingProblem({
        title: "Firm cushion chair",
        description: "Seats 2. About 30 inches wide.",
        category: "Furniture",
        tags: ["chair"],
      }),
    ).toBeUndefined();
  });
  it("asks for a condition when the scan couldn't judge one", async () => {
    const { token, base } = await setup(fixtureItems[1]);
    const missing = await call("POST", `${base}/listing`, {}, token);
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toContain("condition");
    expect(create).not.toHaveBeenCalled();
    create.mockResolvedValue(reply({ title: "Brass desk lamp, untested" }));
    const kit = await (
      await call("POST", `${base}/listing`, { condition: "Used – Fair" }, token)
    ).json();
    expect(kit.condition).toBe("Used – Fair");
    // Regenerating keeps the condition the seller chose.
    await call("POST", `${base}/listing`, {}, token);
    expect(create.mock.calls[1][0].messages[0].content[1].text).toContain(
      "Used – Fair",
    );
  });
  it("saves seller edits and the listed status, but keeps them out of the public store", async () => {
    const { store, token, item, base } = await setup();
    expect(
      (await call("PATCH", `${base}/listing`, { title: "Mug" }, token)).status,
    ).toBe(404);
    create.mockResolvedValue(reply({}));
    await call("POST", `${base}/listing`, {}, token);
    expect(
      (
        await call(
          "PATCH",
          `${base}/listing`,
          { url: "https://evil.example/marketplace" },
          token,
        )
      ).status,
    ).toBe(400);
    expect(
      (await call("PATCH", `${base}/listing`, { url: "not a link" }, token))
        .status,
    ).toBe(400);
    // "I listed it" without a pasted link.
    const listed = await call(
      "PATCH",
      `${base}/listing`,
      { status: "listed", url: "" },
      token,
    );
    expect(listed.status).toBe(200);
    expect((await listed.json()).url).toBeUndefined();
    const edited = await (
      await call(
        "PATCH",
        `${base}/listing`,
        {
          title: "Blue mug",
          price: 1,
          status: "listed",
          url: "https://www.facebook.com/marketplace/item/123",
        },
        token,
      )
    ).json();
    expect(edited).toMatchObject({
      title: "Blue mug",
      price: 8,
      status: "listed",
      url: "https://www.facebook.com/marketplace/item/123",
    });
    expect(edited.listedAt).toBeTruthy();
    const owner = await (
      await call("GET", `/stores/${store.id}`, undefined, token)
    ).json();
    expect(owner.items[0].marketplace).toEqual({
      status: "listed",
      url: "https://www.facebook.com/marketplace/item/123",
    });
    const publicView = await (await call("GET", `/stores/${store.id}`)).json();
    expect(publicView.items[0].marketplace).toBeUndefined();
    expect(publicView.items[0].id).toBe(item.id);
  });
  it("serves a square crop without the phone's metadata, or the whole photo", async () => {
    const { token, base } = await setup();
    const response = await call("GET", `${base}/listing-photo`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    const cropped = await sharp(
      Buffer.from(await response.arrayBuffer()),
    ).metadata();
    expect(cropped.width).toBe(cropped.height);
    expect(cropped.width).toBe(348); // 1.16 × the 300 px box height
    expect(cropped.exif).toBeUndefined();
    create.mockResolvedValue(reply({}));
    await call("POST", `${base}/listing`, {}, token);
    await call("PATCH", `${base}/listing`, { crop: null }, token);
    const whole = await sharp(
      Buffer.from(
        await (await call("GET", `${base}/listing-photo`)).arrayBuffer(),
      ),
    ).metadata();
    expect([whole.width, whole.height]).toEqual([800, 600]);
    expect(whole.exif).toBeUndefined();
  });
});

describe("Facebook holds and sales", () => {
  it("holds stock for a Facebook buyer so storefront buyers can't take it", async () => {
    const { store, token, item, base } = await setup();
    expect(
      (await call("POST", `${base}/facebook-hold`, { quantity: 1 })).status,
    ).toBe(401);
    const held = await (
      await call("POST", `${base}/facebook-hold`, { quantity: 2 }, token)
    ).json();
    expect(held.items[0]).toMatchObject({
      remaining: 2,
      available: 0,
      held: 2,
    });
    expect(() =>
      repo.reserve(store.id, randomUUID(), [{ itemId: item.id, quantity: 1 }]),
    ).toThrow("no longer available");
    // The storefront and the seller's list both count it as unavailable.
    expect(
      (await (await call("GET", `/stores/${store.id}`)).json()).items[0],
    ).toMatchObject({
      available: 0,
    });
    const released = await (
      await call("DELETE", `${base}/facebook-hold`, undefined, token)
    ).json();
    expect(released.items[0]).toMatchObject({ available: 2 });
    expect(released.items[0].held).toBeUndefined();
  });
  it("never holds stock that is already in a buyer's checkout", async () => {
    const { store, token, item, base } = await setup();
    repo.reserve(store.id, randomUUID(), [{ itemId: item.id, quantity: 1 }]);
    const tooMany = await call(
      "POST",
      `${base}/facebook-hold`,
      { quantity: 2 },
      token,
    );
    expect(tooMany.status).toBe(409);
    expect(
      (await call("POST", `${base}/facebook-hold`, { quantity: 1 }, token))
        .status,
    ).toBe(200);
    expect(repo.snapshot(store.id).items[0]).toMatchObject({
      available: 0,
      held: 1,
    });
  });
  it("records a Facebook sale by quantity only, once per request key", async () => {
    const { store, token, item, base } = await setup();
    create.mockResolvedValue(reply({}));
    await call("POST", `${base}/listing`, {}, token);
    await call("PATCH", `${base}/listing`, { status: "listed" }, token);
    await call("POST", `${base}/facebook-hold`, { quantity: 1 }, token);
    const revision = repo.store(store.id)!.revision;
    const requestKey = randomUUID();
    const sold = await (
      await call(
        "POST",
        `${base}/sold-elsewhere`,
        { quantity: 1, requestKey },
        token,
      )
    ).json();
    // The hold became the sale; the other unit is still for sale.
    expect(sold.items[0]).toMatchObject({
      remaining: 1,
      available: 1,
      status: "live",
    });
    expect(sold.items[0].held).toBeUndefined();
    expect(sold.stats).toEqual({ revenue: 0, sold: 0, orders: 0 });
    expect(sold.activity[0].message).toBe(
      "Sold on Facebook · Blue ceramic mug",
    );
    expect(repo.store(store.id)!.revision).toBeGreaterThan(revision);
    expect(repo.outbox().some((o) => o.store_id === store.id)).toBe(true);
    // A retried request doesn't sell a second unit; reusing the key for another sale fails.
    await call(
      "POST",
      `${base}/sold-elsewhere`,
      { quantity: 1, requestKey },
      token,
    );
    expect(repo.snapshot(store.id).items[0].remaining).toBe(1);
    expect(
      (
        await call(
          "POST",
          `${base}/sold-elsewhere`,
          { quantity: 2, requestKey },
          token,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          "POST",
          `${base}/sold-elsewhere`,
          { quantity: 2, requestKey: randomUUID() },
          token,
        )
      ).status,
    ).toBe(409);
    expect(repo.listingKit(item.id)?.status).toBe("listed");
    await call(
      "POST",
      `${base}/sold-elsewhere`,
      { quantity: 1, requestKey: randomUUID() },
      token,
    );
    const last = repo.snapshot(store.id).items[0];
    expect(last).toMatchObject({ remaining: 0, available: 0, status: "sold" });
    // Sold on Facebook, so there's no "mark it sold on Facebook" reminder to show.
    expect(last.marketplace?.status).toBe("closed");
  });
  it("keeps stock in an open checkout payable after a Facebook sale", async () => {
    const { store, token, item, base } = await setup();
    const order = repo.reserve(store.id, randomUUID(), [
      { itemId: item.id, quantity: 1 },
    ]);
    expect(
      (
        await call(
          "POST",
          `${base}/sold-elsewhere`,
          { quantity: 2, requestKey: randomUUID() },
          token,
        )
      ).status,
    ).toBe(409);
    await call(
      "POST",
      `${base}/sold-elsewhere`,
      { quantity: 1, requestKey: randomUUID() },
      token,
    );
    repo.linkOrder(order.id, { paymentUrl: "https://square.link/x" });
    expect(repo.complete(order.id, "pay-1", order.totalCents).state).toBe(
      "paid",
    );
    expect(repo.snapshot(store.id).items[0]).toMatchObject({
      remaining: 0,
      status: "sold",
    });
  });
});

describe("item crops from the photo scan", () => {
  it("converts the model's pixel box to fractions of the photo, or drops it", () => {
    const size = { width: 800, height: 600 };
    expect(
      normalizeBox({ x: 400, y: 150, width: 200, height: 300 }, size),
    ).toEqual({
      x: 0.5,
      y: 0.25,
      w: 0.25,
      h: 0.5,
    });
    // Clamped to the photo.
    expect(
      normalizeBox({ x: -40, y: 300, width: 200, height: 900 }, size),
    ).toEqual({
      x: 0,
      y: 0.5,
      w: 0.2,
      h: 0.5,
    });
    expect(normalizeBox(null, size)).toBeUndefined();
    expect(
      normalizeBox({ x: 10, y: 10, width: 2, height: 2 }, size),
    ).toBeUndefined();
    expect(normalizeBox({ x: 1, y: 1, width: 10, height: 10 })).toBeUndefined();
  });
  it("asks for boxes with the photo's size and returns them with each item", async () => {
    create.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            items: [
              {
                name: "Blue mug",
                description: "Ceramic mug",
                category: "Home",
                suggestedPrice: 7,
                quantity: 1,
                confidence: 0.9,
                condition: "Good",
                reasoning: "Visible.",
                box: { x: 400, y: 150, width: 200, height: 300 },
              },
              {
                name: "Paperback",
                description: "Book",
                category: "Books",
                suggestedPrice: 3,
                quantity: 1,
                confidence: 0.8,
                condition: "Good",
                reasoning: "Visible.",
                box: null,
              },
            ],
          }),
        },
      ],
    });
    const items = await scanPhoto(await photo());
    expect(create.mock.calls[0][0].messages[0].content[1].text).toContain(
      "800×600 pixels",
    );
    expect(items[0].box).toEqual({ x: 0.5, y: 0.25, w: 0.25, h: 0.5 });
    expect(items[1].box).toBeUndefined();
  });
});
