import { Comparison } from "../contracts";
import { AppError, requireConfig } from "../server/errors";
export function normalizeComparisons(input: unknown): Comparison[] {
  if (!Array.isArray(input)) return [];
  return input
    .flatMap((i) => {
      const parsed = Comparison.safeParse(
        i &&
          typeof i === "object" &&
          typeof (i as Comparison).title === "string"
          ? { ...i, title: (i as Comparison).title.slice(0, 200) }
          : i,
      );
      if (!parsed.success) return [];
      const url = new URL(parsed.data.url);
      return url.protocol === "https:" &&
        (url.hostname === "www.ebay.com" || url.hostname === "ebay.com")
        ? [parsed.data]
        : [];
    })
    .slice(0, 8);
}
export function medianPrice(comparisons: Comparison[]) {
  const prices = comparisons.map((c) => c.price).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  if (!prices.length) return null;
  const median =
    prices.length % 2
      ? prices[middle]
      : (prices[middle - 1] + prices[middle]) / 2;
  return Math.round(median * 100) / 100;
}
export async function comparePrices(name: string) {
  const actor = process.env.APIFY_ACTOR_ID || "ninhothedev~ebay-scraper";
  const response = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?timeout=45&memory=512`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireConfig("APIFY_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        searchQueries: [name],
        marketplace: "ebay.com",
        condition: ["used"],
        buyingFormat: "buy_it_now",
        maxItems: 8,
        includeDetails: false,
      }),
      signal: AbortSignal.timeout(50000),
    },
  );
  if (!response.ok)
    throw new AppError(
      502,
      "Price research is temporarily unavailable. You can still set your own price.",
    );
  const comparisons = normalizeComparisons(await response.json());
  return {
    comparisons,
    median: medianPrice(comparisons),
    source: "Apify · active eBay asking prices",
    note: "These are asking prices, not confirmed sales. Compare condition and exact model before changing your price.",
  };
}
