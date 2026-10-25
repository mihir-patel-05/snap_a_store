import { createHmac, timingSafeEqual } from "node:crypto";
import type { Item, Order } from "../contracts";
import { AppError } from "../server/errors";
import { repo } from "../repo";
import { squareAccessToken } from "../server/square-accounts";
import { paymentEnvironment } from "../server/config";
export async function square<T>(
  path: string,
  body?: unknown,
  method = "POST",
  storeId?: string,
): Promise<T> {
  const response = await fetch(
    `${paymentEnvironment() === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com"}/v2${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${await squareAccessToken(storeId)}`,
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
  }>(
    "/catalog/batch-upsert",
    {
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
    },
    "POST",
    items[0]?.storeId,
  );
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
type CatalogItem = {
  id: string;
  type: string;
  version: number;
  is_deleted?: boolean;
  item_data: {
    [key: string]: unknown;
    variations: {
      id: string;
      type: string;
      version: number;
      item_variation_data: { [key: string]: unknown };
    }[];
  };
};
// Square uses full replacement. Fetch and retain the existing object/version,
// other variations, taxes and modifiers; change only our listing fields.
export async function prepareCatalogEdit(
  item: Item,
  key: string,
): Promise<Record<string, unknown>> {
  if (!item.catalogId || !item.variationId)
    throw new AppError(
      409,
      "This product is missing its Square catalog connection.",
    );
  const { object } = await square<{ object: CatalogItem }>(
    `/catalog/object/${encodeURIComponent(item.catalogId)}`,
    undefined,
    "GET",
    item.storeId,
  );
  if (
    !object ||
    object.id !== item.catalogId ||
    object.type !== "ITEM" ||
    object.is_deleted ||
    !object.version ||
    !Array.isArray(object.item_data?.variations) ||
    !object.item_data.variations.some(
      (v) =>
        v.id === item.variationId && v.type === "ITEM_VARIATION" && v.version,
    )
  )
    throw new AppError(
      502,
      "Square could not load this product for editing. Retry saving.",
    );
  const { description_html, description_plaintext, ...details } =
    object.item_data;
  return {
    idempotency_key: key,
    object: {
      ...object,
      item_data: {
        ...details,
        name: item.name,
        description: item.description,
        variations: object.item_data.variations.map((v) =>
          v.id !== item.variationId
            ? v
            : {
                ...v,
                item_variation_data: {
                  ...v.item_variation_data,
                  pricing_type: "FIXED_PRICING",
                  price_money: {
                    amount: Math.round(item.price * 100),
                    currency: "USD",
                  },
                },
              },
        ),
      },
    },
  };
}
export async function updateCatalogItem(
  request: Record<string, unknown>,
  item: Item,
) {
  const result = await square<{ catalog_object?: { id: string } }>(
    "/catalog/object",
    request,
    "POST",
    item.storeId,
  );
  if (result.catalog_object?.id !== item.catalogId)
    throw new AppError(
      502,
      "Square did not confirm the updated product. Retry saving the same changes.",
    );
}

// Deleting an item also deletes its variations. Square reports partial success
// for objects that are already gone, so a retry after a timeout is safe.
export async function deleteCatalog(ids: string[], storeId: string) {
  for (let n = 0; n < ids.length; n += 200)
    await square(
      "/catalog/batch-delete",
      { object_ids: ids.slice(n, n + 200) },
      "POST",
      storeId,
    );
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
  }>(
    "/online-checkout/payment-links",
    {
      idempotency_key: order.id,
      order: {
        location_id: repo.store(order.storeId)?.locationId,
        reference_id: order.id,
        pricing_options: {
          auto_apply_taxes: false,
          auto_apply_discounts: false,
        },
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
    },
    "POST",
    order.storeId,
  );
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
