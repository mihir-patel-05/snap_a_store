import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import {
  type Comparison,
  DraftItem,
  type MarketEvidence,
  Money,
  PriceRationale,
} from "../contracts";
import { AppError, requireConfig } from "../server/errors";
import { comparePrices, medianPrice } from "./apify";
import { marketEvidencePrompt, VISION_SYSTEM_PROMPT } from "./vision-prompt";
const Rationale = PriceRationale.omit({ assumedCondition: true, market: true });
export const VisionOutput = z.object({
  items: z
    .array(
      DraftItem.omit({
        id: true,
        price: true,
        photoId: true,
        priceRationale: true,
      }).extend({
        rationale: Rationale,
        searchQuery: z.string().max(100).default(""),
      }),
    )
    .max(30),
});
export const RepriceOutput = z.object({
  items: z
    .array(
      z.object({
        item: z.number().int().min(0),
        matches: z.array(z.number().int().min(0)).max(8),
        suggestedPrice: Money,
        rationale: Rationale.pick({ factors: true }),
        reasoning: z.string().max(500),
      }),
    )
    .max(30),
});
// Apify runs per scan; the highest-value identifiable items are researched first.
const MAX_LOOKUPS = 6;
export async function prepareImage(bytes: Buffer) {
  try {
    const source = sharp(bytes, { limitInputPixels: 40_000_000 });
    const metadata = await source.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || ""))
      throw new Error("Unsupported image encoding");
    return await source
      .rotate()
      .resize({
        width: 1568,
        height: 1568,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AppError(
      400,
      "This image could not be read. Try a JPEG, PNG, or WebP photo.",
    );
  }
}
// Fits estimates to whole cents and text to listing limits; values are never invented.
function tidy(output: unknown) {
  const items = (output as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return output;
  return {
    items: items.map((i) => {
      if (!i || typeof i !== "object") return i;
      const item = i as Record<string, unknown>;
      return {
        ...item,
        ...(typeof item.suggestedPrice === "number"
          ? { suggestedPrice: Math.round(item.suggestedPrice * 100) / 100 }
          : {}),
        ...(typeof item.description === "string"
          ? { description: item.description.slice(0, 400) }
          : {}),
        ...(typeof item.reasoning === "string"
          ? { reasoning: item.reasoning.slice(0, 500) }
          : {}),
        ...(typeof item.searchQuery === "string"
          ? { searchQuery: item.searchQuery.trim().slice(0, 100) }
          : {}),
        ...(item.rationale && typeof item.rationale === "object"
          ? { rationale: tidyRationale(item.rationale) }
          : {}),
      };
    }),
  };
}
function tidyRationale(value: object) {
  const rationale = value as Record<string, unknown>;
  return {
    ...rationale,
    ...(typeof rationale.conditionNote === "string"
      ? { conditionNote: rationale.conditionNote.slice(0, 200) }
      : {}),
    ...(Array.isArray(rationale.factors)
      ? {
          factors: rationale.factors
            .filter((f) => typeof f !== "string" || f.trim())
            .slice(0, 4)
            .map((f) => (typeof f === "string" ? f.trim().slice(0, 140) : f)),
        }
      : {}),
  };
}
const rationaleSchema = (properties: Record<string, unknown>) => ({
  type: "object",
  description: "Short seller-facing explanation of the price.",
  properties: {
    ...properties,
    factors: {
      type: "array",
      description:
        "2 to 4 short reasons that moved the price, each under 140 characters. Start with the estimated new price.",
      items: { type: "string" },
    },
  },
  required: [...Object.keys(properties), "factors"],
  additionalProperties: false,
});
const priceField = {
  type: "number",
  description:
    "USD per unit, 0.50 to 10000, rounded to a sale-friendly amount.",
};
const reasoningField = {
  type: "string",
  description:
    "What the seller should verify before listing. Under 300 characters.",
};
const scanSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "At most 30 items.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: {
            type: "string",
            description: "Under 300 characters.",
          },
          category: {
            type: "string",
            enum: ["Home", "Books", "Electronics", "Fashion", "Other"],
          },
          suggestedPrice: priceField,
          quantity: { type: "integer", description: "1 to 100." },
          confidence: { type: "number", description: "0 to 1." },
          condition: {
            type: "string",
            enum: ["Like new", "Good", "Fair", "Check condition"],
          },
          rationale: rationaleSchema({
            conditionNote: {
              type: "string",
              description:
                "Visible evidence behind the assumed condition. One sentence, under 200 characters.",
            },
          }),
          reasoning: reasoningField,
          searchQuery: {
            type: "string",
            description:
              "eBay search for this exact product, under 80 characters, or empty for generic items.",
          },
        },
        required: [
          "name",
          "description",
          "category",
          "suggestedPrice",
          "quantity",
          "confidence",
          "condition",
          "rationale",
          "reasoning",
          "searchQuery",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};
const repriceSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: {
            type: "integer",
            description: "Item number from the message.",
          },
          matches: {
            type: "array",
            description: "Numbers of the listings that are the same product.",
            items: { type: "integer" },
          },
          suggestedPrice: priceField,
          rationale: rationaleSchema({}),
          reasoning: reasoningField,
        },
        required: [
          "item",
          "matches",
          "suggestedPrice",
          "rationale",
          "reasoning",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};
function parseJson(response: Anthropic.Message) {
  const text = response.content.find((c) => c.type === "text");
  try {
    return JSON.parse(text?.type === "text" ? text.text : "");
  } catch {
    return null;
  }
}
type ScannedItem = z.infer<typeof VisionOutput>["items"][number];
// Missing Apify credentials or a failed run leaves that item on Claude's estimate.
async function researchPrices(items: ScannedItem[]) {
  const research = new Map<number, { query: string; listings: Comparison[] }>();
  if (!process.env.APIFY_TOKEN) return research;
  const runs = new Map<string, Promise<Comparison[] | null>>();
  const picks = items
    .map((i, n) => ({ n, query: i.searchQuery, value: i.suggestedPrice }))
    .filter((p) => p.query.length >= 2)
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_LOOKUPS);
  await Promise.all(
    picks.map(async ({ n, query }) => {
      const key = query.toLowerCase();
      if (!runs.has(key))
        runs.set(
          key,
          comparePrices(query).then(
            (r) => r.comparisons,
            (error) => {
              console.warn(
                "Apify price research failed",
                error instanceof Error ? error.message : error,
              );
              return null;
            },
          ),
        );
      const listings = await runs.get(key)!;
      if (listings) research.set(n, { query, listings });
    }),
  );
  return research;
}
export async function scanPhoto(bytes: Buffer) {
  const client = new Anthropic({
    apiKey: requireConfig("ANTHROPIC_API_KEY"),
    maxRetries: 1,
    // High effort thinks longer before answering.
    timeout: 90000,
  });
  const request = {
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    // Leaves room for adaptive thinking ahead of the JSON answer.
    max_tokens: 16000,
    system: VISION_SYSTEM_PROMPT,
  };
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: bytes.toString("base64"),
          },
        },
        {
          type: "text",
          text: "Make an editable listing for every distinct item on this table.",
        },
      ],
    },
  ];
  const response = await client.messages.create({
    ...request,
    messages,
    // Current models reject forced tool_choice; structured output returns schema-valid JSON.
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: scanSchema },
    },
  });
  if (response.stop_reason === "refusal")
    throw new AppError(
      422,
      "This photo can't be listed. Try a photo of everyday secondhand items.",
    );
  const result = VisionOutput.safeParse(tidy(parseJson(response)));
  if (!result.success)
    throw new AppError(
      502,
      "The image analysis returned incomplete listings. Try a clearer photo.",
    );
  const items = result.data.items;
  const research = await researchPrices(items);
  const found = [...research].filter(([, r]) => r.listings.length);
  const repriced = new Map<
    number,
    z.infer<typeof RepriceOutput>["items"][number]
  >();
  if (found.length) {
    try {
      // The follow-up keeps Claude's first answer (thinking included) so it judges
      // the listings against the same photo and estimates.
      const follow = await client.messages.create({
        ...request,
        messages: [
          ...messages,
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: marketEvidencePrompt(
              found.map(([n, r]) => ({
                item: n,
                name: items[n].name,
                query: r.query,
                estimate: items[n].suggestedPrice,
                listings: r.listings,
              })),
            ),
          },
        ],
        output_config: {
          effort: "high",
          format: { type: "json_schema", schema: repriceSchema },
        },
      });
      const parsed =
        follow.stop_reason === "refusal"
          ? null
          : RepriceOutput.safeParse(tidy(parseJson(follow)));
      if (!parsed?.success)
        console.warn("Market repricing returned no usable prices");
      else
        for (const r of parsed.data.items)
          if (research.get(r.item)?.listings.length) repriced.set(r.item, r);
    } catch (error) {
      console.warn(
        "Market repricing failed",
        error instanceof Error ? error.message : error,
      );
    }
  }
  return items.map(({ rationale, searchQuery, ...i }, n) => {
    const evidence = research.get(n);
    const update = repriced.get(n);
    let market: MarketEvidence | undefined;
    // Listings are shown only when Claude vetted them, or when the search found none.
    if (evidence && (update || !evidence.listings.length)) {
      const listings = [...new Set(update?.matches)]
        .filter((m) => m < evidence.listings.length)
        .map((m) => evidence.listings[m]);
      market = {
        query: searchQuery,
        checked: evidence.listings.length,
        listings,
        median: medianPrice(listings),
      };
    }
    const suggestedPrice = update?.suggestedPrice ?? i.suggestedPrice;
    return {
      ...i,
      suggestedPrice,
      reasoning: update?.reasoning ?? i.reasoning,
      id: randomUUID(),
      price: suggestedPrice,
      priceRationale: {
        assumedCondition: i.condition,
        ...rationale,
        ...(update ? { factors: update.rationale.factors } : {}),
        ...(market ? { market } : {}),
      },
    };
  });
}
