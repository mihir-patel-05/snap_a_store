import { describe, expect, it, vi, afterEach } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));
import { scanPhoto } from "../lib/providers/vision";
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
              rationale: {
                conditionNote: "No chips visible; light wear on the handle.",
                factors: ["Plain mug, no brand visible", "Sold per unit"],
              },
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
    expect(
      params.output_config.format.schema.properties.items.items.required,
    ).toContain("rationale");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "Blue mug",
      suggestedPrice: 7.5,
      price: 7.5,
      quantity: 2,
      priceRationale: {
        assumedCondition: "Good",
        conditionNote: "No chips visible; light wear on the handle.",
        factors: ["Plain mug, no brand visible", "Sold per unit"],
      },
    });
    expect(items[0]).not.toHaveProperty("rationale");
    expect(items[0].id).toBeTruthy();
  });
  it("fits the price rationale to listing limits without inventing reasons", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    create.mockResolvedValue(
      reply(
        JSON.stringify({
          items: [
            {
              name: "Desk lamp",
              description: "Brass-tone lamp",
              category: "Home",
              suggestedPrice: 20,
              quantity: 1,
              confidence: 0.8,
              condition: "Check condition",
              rationale: {
                conditionNote: "x".repeat(250),
                factors: [" Switch untested ", "", "a", "b", "c", "d"],
              },
              reasoning: "Test the switch.",
            },
          ],
        }),
      ),
    );
    const [item] = await scanPhoto(Buffer.from("jpeg"));
    expect(item.priceRationale).toEqual({
      assumedCondition: "Check condition",
      conditionNote: "x".repeat(200),
      factors: ["Switch untested", "a", "b", "c"],
    });
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
});
