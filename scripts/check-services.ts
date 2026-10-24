import { loadEnvConfig } from "@next/env";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { paymentEnvironment } from "../lib/server/config";
loadEnvConfig(process.cwd(), true);
async function check(name: string, keys: string[], run: () => Promise<void>) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.log(`${name}: NOT CONFIGURED (${missing.join(", ")})`);
    process.exitCode = 1;
    return;
  }
  try {
    await run();
    console.log(`${name}: account access verified`);
  } catch (e) {
    console.error(
      `${name}: ${e instanceof Error ? e.message : "connection failed"}`,
    );
    process.exitCode = 1;
  }
}
async function get(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!r.ok)
    throw new Error(
      `HTTP ${r.status}; check credentials, permissions, environment, and billing.`,
    );
  return r.json();
}
async function main() {
  await check("Claude", ["ANTHROPIC_API_KEY"], async () => {
    await get(
      `https://api.anthropic.com/v1/models/${process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"}`,
      {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
    );
  });
  await check(
    "Square",
    ["SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID"],
    async () => {
      const data = await get(
        `${paymentEnvironment() === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com"}/v2/locations/${process.env.SQUARE_LOCATION_ID}`,
        {
          Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          "Square-Version": "2026-09-16",
        },
      );
      if (
        data.location?.status !== "ACTIVE" ||
        data.location?.currency !== "USD" ||
        !data.location?.capabilities?.includes("CREDIT_CARD_PROCESSING")
      )
        throw new Error(
          "Location must be active, use USD, and have card processing enabled.",
        );
    },
  );
  await check("Apify", ["APIFY_TOKEN"], async () => {
    await get(
      `https://api.apify.com/v2/acts/${encodeURIComponent(process.env.APIFY_ACTOR_ID || "ninhothedev~ebay-scraper")}`,
      { Authorization: `Bearer ${process.env.APIFY_TOKEN}` },
    );
  });
  await check(
    "Cartesia",
    ["CARTESIA_API_KEY", "CARTESIA_VOICE_ID"],
    async () => {
      await get(
        `https://api.cartesia.ai/voices/${encodeURIComponent(process.env.CARTESIA_VOICE_ID!)}`,
        {
          Authorization: `Bearer ${process.env.CARTESIA_API_KEY}`,
          "Cartesia-Version": process.env.CARTESIA_VERSION || "2026-08-14",
        },
      );
    },
  );
  await check("Convex", ["CONVEX_URL", "CONVEX_SYNC_SECRET"], async () => {
    const client = new ConvexHttpClient(process.env.CONVEX_URL!);
    await client.query(makeFunctionReference<"query">("inventory:check"), {
      secret: process.env.CONVEX_SYNC_SECRET,
    });
  });
  console.log(
    "These checks do not create listings, generate audio, run paid scans, or charge cards. Complete the end-to-end launch checks in docs/SERVICE-SETUP.md.",
  );
}
void main();
