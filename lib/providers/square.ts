import { createHmac, timingSafeEqual } from "node:crypto";
import type { Item, Order } from "../contracts";
import { AppError, requireConfig } from "../server/errors";
import { paymentEnvironment } from "../server/config";
export async function square<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(
    `${paymentEnvironment() === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com"}/v2${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${requireConfig("SQUARE_ACCESS_TOKEN")}`,
        "Square-Version": "2026-09-16",
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    },
  );
  if (method === "DELETE" && response.status === 404) return {} as T;
  const data = await response.json();
  if (!response.ok || data.errors?.length)
    throw new AppError(
      502,
      `Square could not complete the request (${response.status}). Check the Square configuration and retry.`,
    );
  return data as T;
}
export async function createCatalog(items: Item[], key: string) {
  const response = await square<{
    id_mappings: { client_object_id: string; object_id: string }[];
  }>("/catalog/batch-upsert", {
    idempotency_key: key,
    batches: [
      {
        objects: items.map((i, n) => ({
          type: "ITEM",
          id: `#item-${n}`,
          item_data: {
            name: i.name,
            description: i.description,
            variations: [
              {
                type: "ITEM_VARIATION",
                id: `#variation-${n}`,
                item_variation_data: {
                  item_id: `#item-${n}`,
                  name: "Regular",
                  pricing_type: "FIXED_PRICING",
                  price_money: {
                    amount: Math.round(i.price * 100),
                    currency: "USD",
                  },
                  track_inventory: false,
                },
              },
            ],
          },
        })),
      },
    ],
  });
  const mapping = new Map(
    response.id_mappings.map((m) => [m.client_object_id, m.object_id]),
  );
  return items.map((i, n) => {
    const catalogId = mapping.get(`#item-${n}`),
      variationId = mapping.get(`#variation-${n}`);
    if (!catalogId || !variationId)
      throw new AppError(
        502,
        "Square returned an incomplete catalog. Retry publishing.",
      );
    return { ...i, catalogId, variationId };
  });
}
// Deleting an item also deletes its variations. Square reports partial success
// for objects that are already gone, so a retry after a timeout is safe.
export async function deleteCatalog(ids: string[]) {
  for (let n = 0; n < ids.length; n += 200)
    await square("/catalog/batch-delete", {
      object_ids: ids.slice(n, n + 200),
    });
}
export async function createPaymentLink(order: Order, base: string) {
  const result = await square<{
    payment_link: { id: string; url: string; order_id: string };
    related_resources?: {
      orders: {
        total_money: { amount: number; currency: string };
        total_tax_money: { amount: number };
      }[];
    };
  }>("/online-checkout/payment-links", {
    idempotency_key: order.id,
    order: {
      location_id: requireConfig("SQUARE_LOCATION_ID"),
      reference_id: order.id,
      pricing_options: { auto_apply_taxes: false, auto_apply_discounts: false },
      ...(Number(order.taxPercent) > 0
        ? {
            taxes: [
              {
                uid: "sales-tax",
                name: "Sales tax",
                percentage: order.taxPercent,
                scope: "ORDER",
                type: "ADDITIVE",
              },
            ],
          }
        : {}),
      line_items: order.lines.map((l) => ({
        catalog_object_id: l.variationId,
        quantity: String(l.quantity),
        base_price_money: {
          amount: Math.round(l.price * 100),
          currency: "USD",
        },
      })),
    },
    checkout_options: {
      redirect_url: `${base}/pay/${order.id}`,
      ask_for_shipping_address: false,
      allow_tipping: false,
    },
  });
  if (!result.payment_link?.url || !result.payment_link.order_id)
    throw new AppError(
      502,
      "Square did not return a checkout link. Retry with the same cart.",
    );
  const remote = result.related_resources?.orders?.[0];
  if (
    !remote ||
    remote.total_money.currency !== "USD" ||
    !Number.isSafeInteger(remote.total_money.amount) ||
    remote.total_money.amount < order.subtotalCents ||
    remote.total_money.amount - (remote.total_tax_money?.amount || 0) !==
      order.subtotalCents
  )
    throw new AppError(
      502,
      "Square returned an unexpected total. Retry this checkout; your items remain reserved.",
    );
  const destination = new URL(result.payment_link.url);
  if (
    destination.protocol !== "https:" ||
    ![
      "square.link",
      "sandbox.square.link",
      "checkout.square.site",
      "squareup.com",
      "connect.squareup.com",
      "connect.squareupsandbox.com",
    ].includes(destination.hostname)
  )
    throw new AppError(502, "Square returned an unexpected checkout URL.");
  return {
    totalCents: remote.total_money.amount,
    taxCents: remote.total_tax_money?.amount || 0,
    linkId: result.payment_link.id,
    paymentUrl: result.payment_link.url,
    squareOrderId: result.payment_link.order_id,
  };
}
export function verifySquareSignature(
  raw: string,
  signature: string,
  secret: string,
  url: string,
) {
  if (!secret || !signature || !url) return false;
  const expected = createHmac("sha256", secret)
    .update(url + raw)
    .digest("base64");
  const received = Buffer.from(signature);
  const check = Buffer.from(expected);
  return received.length === check.length && timingSafeEqual(received, check);
}
