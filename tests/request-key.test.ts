import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { newRequestKey } from "../lib/request-key";
afterEach(() => vi.unstubAllGlobals());
describe("checkout keys on HTTP", () => {
  it("uses secure random bytes when randomUUID is unavailable", async () => {
    vi.stubGlobal("crypto", {
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    });
    const keys = await Promise.all(
      Array.from({ length: 100 }, () => newRequestKey()),
    );
    expect(new Set(keys).size).toBe(100);
    for (const key of keys)
      expect(key).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
      );
  });
  it("uses server keys when the browser has no crypto object", async () => {
    vi.stubGlobal("crypto", undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ key: "a68c9393-c7e4-409f-b994-b97317e34a48" }),
        ),
    );
    expect(await newRequestKey()).toBe("a68c9393-c7e4-409f-b994-b97317e34a48");
  });
  it("fails with a useful error instead of making weak random keys", async () => {
    vi.stubGlobal("crypto", undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "unavailable" }, { status: 503 }),
        ),
    );
    await expect(newRequestKey()).rejects.toThrow("Unable to prepare checkout");
  });
});
