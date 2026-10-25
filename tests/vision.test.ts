import { describe, expect, it, vi, afterEach } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    static APIUserAbortError = class extends Error {};
    static APIConnectionTimeoutError = class extends Error {};
    messages = { create };
  },
}));
import Anthropic from "@anthropic-ai/sdk";
import { scanPhoto, SCAN_DEADLINE_MS } from "../lib/providers/vision";
afterEach(() => {
  vi.unstubAllEnvs();
  create.mockReset();
});
const reply = (text: string, stop_reason = "end_turn") => ({
  stop_reason,
  content: [{ type: "text", text }],
});
describe("Claude photo scan", () => {
  it("requests structured JSON without forced tool use and parses it", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    create.mockResolvedValue(
      reply(
        JSON.stringify({
          items: [
            {
              name: "Blue mug",
              description: "Ceramic mug",
              category: "Home",
              suggestedPrice: 7.499,
              quantity: 2,
              confidence: 0.9,
              condition: "Good",
              reasoning: "Clearly visible; condition unverified.",
            },
          ],
        }),
      ),
    );
    const items = await scanPhoto(Buffer.from("jpeg"));
    const params = create.mock.calls[0][0];
    expect(params.tool_choice).toBeUndefined();
    expect(params.tools).toBeUndefined();
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.output_config.effort).toBe("low");
    expect(create.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "Blue mug",
      suggestedPrice: 7.5,
      price: 7.5,
      quantity: 2,
    });
    expect(items[0].id).toBeTruthy();
  });
  it("reports refusals and unparseable output instead of inventing items", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    create.mockResolvedValueOnce(reply("", "refusal"));
    await expect(scanPhoto(Buffer.from("jpeg"))).rejects.toThrow(
      "can't be listed",
    );
    create.mockResolvedValueOnce(reply("not json"));
    await expect(scanPhoto(Buffer.from("jpeg"))).rejects.toThrow(
      "incomplete listings",
    );
  });
  it("fails clearly when Claude cannot answer before the phone gives up", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    expect(SCAN_DEADLINE_MS).toBeLessThan(60_000);
    create.mockRejectedValueOnce(new Anthropic.APIUserAbortError());
    await expect(scanPhoto(Buffer.from("jpeg"))).rejects.toMatchObject({
      status: 504,
      message: expect.stringContaining("took too long"),
    });
    create.mockRejectedValueOnce(new Anthropic.APIConnectionTimeoutError());
    await expect(scanPhoto(Buffer.from("jpeg"))).rejects.toMatchObject({
      status: 504,
    });
  });
});
