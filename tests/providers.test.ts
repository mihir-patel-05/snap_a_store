import { describe, expect, it, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifySquareSignature,
  createCatalog,
  createPaymentLink,
} from "../lib/providers/square";
import { normalizeComparisons } from "../lib/providers/apify";
import { VisionOutput, prepareImage } from "../lib/providers/vision";
import { CheckoutRequest, PublishRequest } from "../lib/contracts";
import { fixtureItems } from "./fixtures/items";
import { randomUUID } from "node:crypto";
import { repo } from "../lib/repo";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Untrusted provider inputs", () => {
  it("validates the Square signature against the exact URL and raw body", () => {
    const body = '{"event_id":"123"}',
      url = "https://store.test/api/webhooks/square",
      secret = "secret",
      signature = createHmac("sha256", secret)
        .update(url + body)
        .digest("base64");
    expect(verifySquareSignature(body, signature, secret, url)).toBe(true);
    expect(verifySquareSignature(body + " ", signature, secret, url)).toBe(
      false,
    );
    expect(verifySquareSignature(body, signature, secret, url + "/")).toBe(
      false,
    );
    expect(verifySquareSignature(body, "junk", secret, url)).toBe(false);
    expect(verifySquareSignature(body, signature, "", url)).toBe(false);
  });
  it("discards wrong currencies, invalid prices, and unsafe comparison URLs", () => {
    const rows = normalizeComparisons([
      {
        title: "Mug",
        price: 12,
        currency: "USD",
        url: "https://www.ebay.com/itm/123",
      },
      {
        title: "Bad",
        price: 12,
        currency: "EUR",
        url: "https://www.ebay.com/itm/1",
      },
      {
        title: "Bad",
        price: -2,
        currency: "USD",
        url: "https://www.ebay.com/itm/2",
      },
      { title: "Bad", price: 5, currency: "USD", url: "javascript:alert(1)" },
      { title: "Bad", price: 5, currency: "USD", url: "https://evil.example/" },
      {
        title: "Long".repeat(100),
        price: 5,
        currency: "USD",
        url: "https://ebay.com/itm/3",
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1].title).toHaveLength(200);
  });
  it("rejects malformed vision output instead of inventing a listing", () => {
    expect(
      VisionOutput.safeParse({
        items: [{ ...fixtureItems[0], confidence: 2 }],
      }).success,
    ).toBe(false);
    expect(VisionOutput.safeParse({ items: [] }).success).toBe(true);
  });
  it("rejects non-image bytes", async () => {
    await expect(prepareImage(Buffer.from("not an image"))).rejects.toThrow(
      "could not be read",
    );
  });
  it("rejects an SVG disguised as an allowed image MIME type", async () => {
    await expect(
      prepareImage(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
        ),
      ),
    ).rejects.toThrow("could not be read");
  });
  it("rejects duplicate cart lines and quantities that could bypass availability", () => {
    const key = randomUUID();
    expect(
      CheckoutRequest.safeParse({
        storeId: "s",
        requestKey: key,
        lines: [
          { itemId: "i", quantity: 1 },
          { itemId: "i", quantity: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      CheckoutRequest.safeParse({
        storeId: "s",
        requestKey: key,
        lines: [{ itemId: "i", quantity: -1 }],
      }).success,
    ).toBe(false);
    expect(
      PublishRequest.safeParse({
        storeId: "s",
        requestKey: key,
        items: [{ ...fixtureItems[0], price: 1.001 }],
      }).success,
    ).toBe(false);
  });
  it("creates Square catalog variations with integer cents and repeat-safe keys", async () => {
    vi.stubEnv("SQUARE_ACCESS_TOKEN", "test");
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        id_mappings: [
          { client_object_id: "#item-0", object_id: "CATALOG" },
          { client_object_id: "#variation-0", object_id: "VAR" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const { store } = repo.createStore("Provider test");
    const item = {
      ...fixtureItems[0],
      storeId: store.id,
      remaining: 2,
      available: 2,
      status: "live" as const,
      publishedAt: "now",
    };
    const result = await createCatalog([item], "same-key");
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.idempotency_key).toBe("same-key");
    expect(
      body.batches[0].objects[0].item_data.variations[0].item_variation_data
        .price_money,
    ).toEqual({ amount: 800, currency: "USD" });
    expect(result[0].variationId).toBe("VAR");
  });
});
describe("Cartesia narration", () => {
  it("sends the voice as an id specifier and logs the provider's rejection", async () => {
    vi.stubEnv("CARTESIA_API_KEY", "key");
    vi.stubEnv("CARTESIA_VOICE_ID", "voice-123");
    const fetchMock = vi.fn(
      async () => new Response('{"error":"bad voice"}', { status: 400 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { speak } = await import("../lib/providers/cartesia");
    await expect(speak("Hello", "en")).rejects.toThrow(
      "Audio is temporarily unavailable",
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.voice).toEqual({ mode: "id", id: "voice-123" });
    expect(log).toHaveBeenCalledWith(
      "Cartesia TTS failed",
      400,
      '{"error":"bad voice"}',
    );
    log.mockRestore();
  });
});
