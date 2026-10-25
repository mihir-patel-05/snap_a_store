import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "../mobile/lib/request";

afterEach(() => vi.useRealTimers());
const url = "https://store.example/api/scan";

describe("mobile request errors", () => {
  it("does not label local multipart failures as a backend connection failure", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(new Error("Unsupported FormDataPart implementation"));
    await expect(requestJson(url, {}, fetcher)).rejects.toThrow(
      "photo could not be prepared",
    );
  });

  it("keeps auth status and the server's actionable error", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Sign in again." }, { status: 401 }),
      );
    await expect(requestJson(url, {}, fetcher)).rejects.toMatchObject({
      status: 401,
      message: "Sign in again.",
    });
  });

  it("reports genuine network failures with the configured host", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(new TypeError("Network request failed"));
    await expect(requestJson(url, {}, fetcher)).rejects.toThrow(
      "EXPO_PUBLIC_API_URL (https://store.example)",
    );
  });

  it.each([false, true])(
    "reports a timeout during %s response reading and clears its timer",
    async (readingBody) => {
      vi.useFakeTimers();
      const fetcher = vi.fn(async (_url, init) => {
        const pending = new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new Error("FetchError")),
          );
        });
        if (!readingBody) return pending;
        return { ok: true, status: 200, json: () => pending };
      });
      const expectation = expect(requestJson(url, {}, fetcher)).rejects.toThrow(
        "request took too long",
      );
      await vi.advanceTimersByTimeAsync(65000);
      await expectation;
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("clears the timeout on success and preserves multipart headers/body", async () => {
    vi.useFakeTimers();
    const body = new FormData();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [] }));
    await expect(
      requestJson(
        url,
        { method: "POST", body, headers: { Authorization: "Bearer test" } },
        fetcher,
      ),
    ).resolves.toEqual({ items: [] });
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      body,
      headers: { Authorization: "Bearer test" },
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
