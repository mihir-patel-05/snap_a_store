import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { DraftItem, PriceRationale } from "../contracts";
import { AppError, requireConfig } from "../server/errors";
import { VISION_SYSTEM_PROMPT } from "./vision-prompt";
export const VisionOutput = z.object({
  items: z
    .array(
      DraftItem.omit({
        id: true,
        price: true,
        photoId: true,
        priceRationale: true,
      }).extend({ rationale: PriceRationale.omit({ assumedCondition: true }) }),
    )
    .max(30),
});
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
export async function scanPhoto(bytes: Buffer) {
  const client = new Anthropic({
    apiKey: requireConfig("ANTHROPIC_API_KEY"),
    maxRetries: 1,
    timeout: 45000,
  });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
    // Leaves room for adaptive thinking ahead of the JSON answer.
    max_tokens: 16000,
    system: VISION_SYSTEM_PROMPT,
    messages: [
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
    ],
    // Current models reject forced tool_choice; structured output returns schema-valid JSON.
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: {
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
                  suggestedPrice: {
                    type: "number",
                    description:
                      "USD per unit, 0.50 to 10000, rounded to a sale-friendly amount.",
                  },
                  quantity: { type: "integer", description: "1 to 100." },
                  confidence: { type: "number", description: "0 to 1." },
                  condition: {
                    type: "string",
                    enum: ["Like new", "Good", "Fair", "Check condition"],
                  },
                  rationale: {
                    type: "object",
                    description:
                      "Short seller-facing explanation of the price.",
                    properties: {
                      conditionNote: {
                        type: "string",
                        description:
                          "Visible evidence behind the assumed condition. One sentence, under 200 characters.",
                      },
                      factors: {
                        type: "array",
                        description:
                          "2 to 4 short reasons that moved the price, each under 140 characters. Start with the estimated new price.",
                        items: { type: "string" },
                      },
                    },
                    required: ["conditionNote", "factors"],
                    additionalProperties: false,
                  },
                  reasoning: {
                    type: "string",
                    description:
                      "What the seller should verify before listing. Under 300 characters.",
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
                ],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
    },
  });
  if (response.stop_reason === "refusal")
    throw new AppError(
      422,
      "This photo can't be listed. Try a photo of everyday secondhand items.",
    );
  const text = response.content.find((c) => c.type === "text");
  let output: unknown = null;
  try {
    output = JSON.parse(text?.type === "text" ? text.text : "");
  } catch {
    /* Reported as incomplete below. */
  }
  const result = VisionOutput.safeParse(tidy(output));
  if (!result.success)
    throw new AppError(
      502,
      "The image analysis returned incomplete listings. Try a clearer photo.",
    );
  return result.data.items.map(({ rationale, ...i }) => ({
    ...i,
    id: randomUUID(),
    price: i.suggestedPrice,
    priceRationale: { assumedCondition: i.condition, ...rationale },
  }));
}
