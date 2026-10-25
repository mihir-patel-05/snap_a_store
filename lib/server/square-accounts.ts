import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { repo } from "../repo";
import type { PaymentConnection, Store } from "../contracts";
import { paymentEnvironment, assertStoreEnvironment } from "./config";
import { AppError, requireConfig } from "./errors";
const Token = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  merchant_id: z.string().min(1),
  expires_at: z.string().datetime(),
});
type Tokens = z.infer<typeof Token>;
export const squareOrigin = () =>
  paymentEnvironment() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
export function squareOAuthConfigured() {
  return Boolean(
    process.env.SQUARE_APPLICATION_ID &&
    process.env.SQUARE_APPLICATION_SECRET &&
    /^[a-f0-9]{64}$/i.test(process.env.OAUTH_ENCRYPTION_KEY || ""),
  );
}
function encryptionKey() {
  const key = requireConfig("OAUTH_ENCRYPTION_KEY");
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new AppError(
      503,
      "Configure a 32-byte hexadecimal OAUTH_ENCRYPTION_KEY.",
    );
  return Buffer.from(key, "hex");
}
export function encryptTokens(storeId: string, value: Tokens) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(storeId));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64url"))
    .join(".");
}
function decryptTokens(storeId: string, encrypted: string) {
  try {
    const [iv, tag, ciphertext] = encrypted
      .split(".")
      .map((v) => Buffer.from(v, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAAD(Buffer.from(storeId));
    decipher.setAuthTag(tag);
    return Token.parse(
      JSON.parse(
        Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
          "utf8",
        ),
      ),
    );
  } catch {
    throw new AppError(
      503,
      "The saved Square connection cannot be read. Check the server encryption key.",
    );
  }
}
export async function obtainSquareToken(
  params: Record<string, string>,
): Promise<Tokens> {
  const response = await fetch(squareOrigin() + "/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Square-Version": "2026-09-16",
    },
    body: JSON.stringify({
      client_id: requireConfig("SQUARE_APPLICATION_ID"),
      client_secret: requireConfig("SQUARE_APPLICATION_SECRET"),
      ...params,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw new AppError(
      502,
      "Square authorization failed. Reconnect your Square account.",
    );
  const parsed = Token.safeParse(await response.json());
  if (!parsed.success)
    throw new AppError(502, "Square returned an incomplete authorization.");
  return parsed.data;
}
function saved(storeId: string) {
  return repo.db
    .prepare(
      "SELECT merchant_id,encrypted FROM square_connections WHERE store_id=?",
    )
    .get(storeId) as { merchant_id: string; encrypted: string } | undefined;
}
async function locations(accessToken: string) {
  const response = await fetch(squareOrigin() + "/v2/locations", {
    headers: {
      Authorization: "Bearer " + accessToken,
      "Square-Version": "2026-09-16",
    },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new AppError(
      502,
      "Could not read your Square locations. Reconnect Square and try again.",
    );
  const data = z
    .object({
      locations: z
        .array(
          z.object({
            id: z.string(),
            name: z.string().optional(),
            status: z.string().optional(),
            currency: z.string().optional(),
            capabilities: z.array(z.string()).optional(),
          }),
        )
        .default([]),
    })
    .parse(await response.json());
  return data.locations
    .filter(
      (l) =>
        l.status === "ACTIVE" &&
        l.currency === "USD" &&
        l.capabilities?.includes("CREDIT_CARD_PROCESSING"),
    )
    .map((l) => ({ id: l.id, name: l.name || l.id }));
}
const refreshing = new Map<string, Promise<string>>();
export async function squareAccessToken(storeId?: string): Promise<string> {
  if (!storeId) return requireConfig("SQUARE_ACCESS_TOKEN");
  const store = repo.store(storeId);
  if (!store) throw new AppError(404, "Store not found.");
  assertStoreEnvironment(store);
  if (store.paymentProvider !== "square_oauth")
    return requireConfig("SQUARE_ACCESS_TOKEN");
  const connection = saved(storeId);
  if (!connection)
    throw new AppError(
      409,
      "Connect your Square account before publishing or accepting payments.",
    );
  const tokens = decryptTokens(storeId, connection.encrypted);
  if (Date.parse(tokens.expires_at) > Date.now() + 5 * 60_000)
    return tokens.access_token;
  if (!refreshing.has(storeId))
    refreshing.set(
      storeId,
      (async () => {
        const next = await obtainSquareToken({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
        });
        if (next.merchant_id !== connection.merchant_id)
          throw new AppError(502, "Square merchant mismatch.");
        const updated = repo.db
          .prepare(
            "UPDATE square_connections SET encrypted=? WHERE store_id=? AND encrypted=?",
          )
          .run(encryptTokens(storeId, next), storeId, connection.encrypted);
        if (!updated.changes)
          throw new AppError(
            409,
            "Your Square connection changed. Retry the request.",
          );
        return next.access_token;
      })().finally(() => {
        refreshing.delete(storeId);
      }),
    );
  return refreshing.get(storeId)!;
}
export async function connectSquare(
  storeId: string,
  code: string,
  redirectUri: string,
) {
  encryptionKey();
  const tokens = await obtainSquareToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const eligible = await locations(tokens.access_token);
  if (!eligible.length)
    throw new AppError(
      409,
      "Square needs an active USD location with card processing enabled.",
    );
  repo.db.transaction(() => {
    const store = repo.store(storeId);
    if (!store || store.paymentProvider !== "square_oauth")
      throw new AppError(403, "This store cannot change its payment account.");
    assertStoreEnvironment(store);
    if (store.merchantId && store.merchantId !== tokens.merchant_id)
      throw new AppError(
        409,
        "Reconnect the same Square merchant. Existing listings and orders belong to that account.",
      );
    if (store.locationId && !eligible.some((l) => l.id === store.locationId))
      throw new AppError(
        409,
        "The existing store location is unavailable in this Square account.",
      );
    repo.db
      .prepare(
        "INSERT INTO square_connections VALUES(?,?,?) ON CONFLICT(store_id) DO UPDATE SET merchant_id=excluded.merchant_id,encrypted=excluded.encrypted",
      )
      .run(storeId, tokens.merchant_id, encryptTokens(storeId, tokens));
    repo.updateStore(storeId, {
      merchantId: tokens.merchant_id,
      locationId:
        store.locationId ||
        (eligible.length === 1 ? eligible[0].id : undefined),
    });
  })();
}
export async function paymentConnection(
  store: Store,
): Promise<PaymentConnection> {
  if (store.paymentProvider !== "square_oauth")
    return {
      connected: Boolean(store.locationId),
      available: false,
      locationId: store.locationId,
      locations: [],
      business: store.business,
    };
  const connection = saved(store.id);
  return {
    connected: Boolean(connection && store.locationId),
    available: squareOAuthConfigured(),
    locationId: store.locationId,
    locations: connection
      ? await locations(await squareAccessToken(store.id))
      : [],
    business: store.business,
  };
}
export async function selectLocation(storeId: string, locationId: string) {
  const eligible = await locations(await squareAccessToken(storeId));
  if (!eligible.some((l) => l.id === locationId))
    throw new AppError(
      400,
      "Choose an active USD location from your Square account.",
    );
  repo.db.transaction(() => {
    const store = repo.store(storeId)!;
    if (store.paymentProvider !== "square_oauth")
      throw new AppError(403, "This location is managed by the administrator.");
    if (
      store.locationId !== locationId &&
      (repo.snapshot(storeId).items.length || repo.orders(storeId).length)
    )
      throw new AppError(
        409,
        "The location cannot change after publishing or taking orders.",
      );
    repo.updateStore(storeId, { locationId });
  })();
}
export function storeForMerchant(merchantId: string, locationId: string) {
  const rows = repo.db
    .prepare("SELECT store_id FROM square_connections WHERE merchant_id=?")
    .all(merchantId) as { store_id: string }[];
  return rows
    .map((r) => repo.store(r.store_id)!)
    .find(
      (s) =>
        s.locationId === locationId && s.paymentMode === paymentEnvironment(),
    );
}
