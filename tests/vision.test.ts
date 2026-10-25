import { describe, expect, it, vi, afterEach } from "vitest";
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));
import { scanPhoto } from "../lib/providers/vision";
import { VISION_SYSTEM_PROMPT } from "../lib/providers/vision-prompt";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
    expect(params.system).toBe(VISION_SYSTEM_PROMPT);
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
describe("market-checked scan prices", () => {
  const scanned = JSON.stringify({
    items: [
      {
        name: "Nintendo Switch OLED console",
        description: "White console with dock",
        category: "Electronics",
        suggestedPrice: 150,
        quantity: 1,
        confidence: 0.9,
        condition: "Check condition",
        rationale: {
          conditionNote: "Screen looks clean; power not shown.",
          factors: ["About $350 new (estimate)", "Function unverified"],
        },
        reasoning: "Power it on and check the Joy-Cons.",
        searchQuery: "Nintendo Switch OLED console",
      },
      {
        name: "Blue mug",
        description: "Ceramic mug",
        category: "Home",
        suggestedPrice: 2,
        quantity: 1,
        confidence: 0.9,
        condition: "Good",
        rationale: { conditionNote: "No chips.", factors: ["Plain mug"] },
        reasoning: "Check for chips.",
        searchQuery: "",
      },
    ],
  });
  const listing = (price: number, n: number) => ({
    title: `Nintendo Switch OLED ${n}`,
    price,
    currency: "USD",
    url: `https://www.ebay.com/itm/${n}`,
  });
  const apify = (rows: unknown, ok = true) => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json(rows, { status: ok ? 200 : 500 }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  };
  it("re-prices identifiable items against the listings Claude judged comparable", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("APIFY_TOKEN", "apify-key");
    const fetch = apify([listing(200, 0), listing(40, 1), listing(250, 2)]);
    const first = reply(scanned);
    create.mockResolvedValueOnce(first).mockResolvedValueOnce(
      reply(
        JSON.stringify({
          items: [
            {
              item: 0,
              matches: [0, 2, 2, 9],
              suggestedPrice: 179.996,
              rationale: {
                factors: ["Two matching listings ask $200 to $250"],
              },
              reasoning: "Confirm it powers on.",
            },
          ],
        }),
      ),
    );
    const [game, mug] = await scanPhoto(Buffer.from("jpeg"));
    // Only the identifiable item is researched.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body).searchQueries).toEqual([
      "Nintendo Switch OLED console",
    ]);
    const follow = create.mock.calls[1][0];
    expect(follow.system).toBe(VISION_SYSTEM_PROMPT);
    expect(follow.messages[1]).toEqual({
      role: "assistant",
      content: first.content,
    });
    expect(follow.messages[2].content).toContain("Listing 2: $250.00");
    expect(follow.messages[2].content).toContain("untrusted");
    expect(game).toMatchObject({
      suggestedPrice: 180,
      price: 180,
      reasoning: "Confirm it powers on.",
      priceRationale: {
        conditionNote: "Screen looks clean; power not shown.",
        factors: ["Two matching listings ask $200 to $250"],
        market: {
          query: "Nintendo Switch OLED console",
          checked: 3,
          listings: [listing(200, 0), listing(250, 2)],
          median: 225,
        },
      },
    });
    expect(game).not.toHaveProperty("searchQuery");
    expect(mug.price).toBe(2);
    expect(mug.priceRationale).not.toHaveProperty("market");
  });
  it("keeps Claude's estimate when price research or re-pricing fails", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("APIFY_TOKEN", "apify-key");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    apify([], false);
    create.mockResolvedValueOnce(reply(scanned));
    let [item] = await scanPhoto(Buffer.from("jpeg"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(item.price).toBe(150);
    expect(item.priceRationale).not.toHaveProperty("market");
    apify([listing(200, 0)]);
    create
      .mockResolvedValueOnce(reply(scanned))
      .mockRejectedValueOnce(new Error("overloaded"));
    [item] = await scanPhoto(Buffer.from("jpeg"));
    expect(item.price).toBe(150);
    expect(item.priceRationale).not.toHaveProperty("market");
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
  it("says when a search found no listings, without a second Claude pass", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("APIFY_TOKEN", "apify-key");
    apify([]);
    create.mockResolvedValueOnce(reply(scanned));
    const [item] = await scanPhoto(Buffer.from("jpeg"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(item.priceRationale?.market).toEqual({
      query: "Nintendo Switch OLED console",
      checked: 0,
      listings: [],
      median: null,
    });
  });
  it("skips price research without Apify credentials", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("APIFY_TOKEN", "");
    const fetch = apify([listing(200, 0)]);
    create.mockResolvedValueOnce(reply(scanned));
    const [item] = await scanPhoto(Buffer.from("jpeg"));
    expect(fetch).not.toHaveBeenCalled();
    expect(item.priceRationale).not.toHaveProperty("market");
  });
});
