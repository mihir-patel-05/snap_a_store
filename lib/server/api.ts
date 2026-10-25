import { z, ZodError } from "zod";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { repo } from "../repo";
import {
  CheckoutRequest,
  CreateStoreRequest,
  DeleteStoreRequest,
  PublishRequest,
  type Integration,
} from "../contracts";
import {
  paymentEnvironment,
  publicBase,
  requirePayments,
  assertStoreEnvironment,
  business,
} from "./config";
import { verifyLogin } from "./auth";
import {
  acceptPayment,
  reconcileOrder,
  cancelCheckout,
  maintenance,
} from "./payments";
import { AppError, requireConfig } from "./errors";
import { prepareImage, scanPhoto } from "../providers/vision";
import {
  createCatalog,
  deleteCatalog,
  createPaymentLink,
  square,
  verifySquareSignature,
} from "../providers/square";
import { comparePrices } from "../providers/apify";
import { narration, speak } from "../providers/cartesia";
import { syncInventory } from "../providers/convex";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function rateLimit(key: string, limit = 25) {
  repo.limit(key, limit);
}
export function integrations(): Integration[] {
  const has = (...keys: string[]) => keys.every((k) => Boolean(process.env[k]));
  return [
    {
      name: "Claude",
      feature: "Photo to editable catalog",
      status: has("ANTHROPIC_API_KEY") ? "ready" : "setup",
      detail: has("ANTHROPIC_API_KEY")
        ? "Vision configured"
        : "Add the Anthropic API key to enable photo recognition",
    },
    {
      name: "Square",
      feature: "Catalog + secure checkout",
      status: has(
        "SQUARE_ACCESS_TOKEN",
        "SQUARE_LOCATION_ID",
        "SQUARE_WEBHOOK_SIGNATURE_KEY",
        "PUBLIC_BASE_URL",
      )
        ? "ready"
        : "setup",
      detail: has("SQUARE_ACCESS_TOKEN", "SQUARE_LOCATION_ID")
        ? `Square ${paymentEnvironment()} credentials configured; verify the connection before selling`
        : "Connect Square to publish and accept payments",
    },
    {
      name: "Apify",
      feature: "Real market comparisons",
      status: has("APIFY_TOKEN") ? "ready" : "setup",
      detail: "Active eBay listings with source links",
    },
    {
      name: "Cartesia",
      feature: "Listen to the storefront",
      status: has("CARTESIA_API_KEY", "CARTESIA_VOICE_ID") ? "ready" : "setup",
      detail: "Spoken product details in English or Spanish",
    },
    {
      name: "Convex",
      feature: "Live inventory across devices",
      status: has("CONVEX_URL", "CONVEX_SYNC_SECRET") ? "ready" : "setup",
      detail: has("CONVEX_URL", "CONVEX_SYNC_SECRET")
        ? "Realtime projection with a durable retry queue"
        : "Local inventory with 3-second refresh",
    },
  ];
}
function token(req: Request) {
  const bearer = req.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice(7);
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("snap_owner="))
      ?.slice(11) || ""
  );
}
function auth(req: Request, id: string) {
  repo.authorize(id, token(req));
  assertStoreEnvironment(repo.store(id)!);
}
// The seller's storefronts for the configured Square location; the first one is created on demand.
function sellerStores() {
  const mode = paymentEnvironment();
  const environment = `${mode}:${requireConfig("SQUARE_LOCATION_ID")}`;
  const store = repo.primaryStore(
    environment,
    process.env.BUSINESS_NAME || "My store",
    mode,
  );
  return { mode, environment, store, stores: repo.sellerStores(environment) };
}
async function bytes(req: Request, max = 100_000) {
  if (Number(req.headers.get("content-length") || 0) > max)
    throw new AppError(413, "Upload is too large.");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      throw new AppError(413, "Upload is too large.");
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
async function body(req: Request) {
  try {
    return JSON.parse(new TextDecoder().decode(await bytes(req)));
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(400, "Invalid JSON request.");
  }
}
function validBase(_req: Request) {
  return publicBase();
}
function sessionCookie(value: string, expired = false) {
  return `snap_owner=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expired ? 0 : 2592000}${publicBase().startsWith("https:") ? "; Secure" : ""}`;
}
const audioCache = new Map<string, { data: ArrayBuffer; at: number }>();
function allowedOrigins(req: Request) {
  return [
    process.env.PUBLIC_BASE_URL?.replace(/\/$/, ""),
    ...(process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()),
    ...(process.env.NODE_ENV !== "production"
      ? [new URL(req.url).origin, "http://localhost:3000"]
      : []),
  ].filter(Boolean);
}
async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname.split("/").filter(Boolean).slice(1);
  const method = req.method;
  const origin = req.headers.get("origin");
  const allowed = allowedOrigins(req);
  if (origin && !allowed.includes(origin))
    throw new AppError(403, "This origin is not allowed.");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(method) &&
    req.headers.get("sec-fetch-site") === "cross-site" &&
    (!origin || !allowed.includes(origin))
  )
    throw new AppError(403, "Cross-site requests are not allowed.");
  if (method === "OPTIONS") return new Response(null, { status: 204 });
  if (p[0] !== "webhooks")
    rateLimit(
      `${process.env.TRUST_PROXY === "1" ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "local"}:${p[0]}`,
      method === "GET" ? 180 : 30,
    );
  if (method === "GET" && p[0] === "health")
    return json({
      ok: true,
      integrations: integrations(),
      convexUrl: process.env.CONVEX_URL || null,
      business: business(),
    });
  if (method === "GET" && p[0] === "request-key")
    return json({ key: randomUUID() });
  if (method === "GET" && p[0] === "ready") {
    requirePayments();
    requireConfig("ANTHROPIC_API_KEY");
    requireConfig("SELLER_EMAIL");
    requireConfig("SELLER_PASSWORD_HASH");
    requireConfig("MAINTENANCE_SECRET");
    repo.db.prepare("SELECT 1").get();
    return json({ ready: true, environment: paymentEnvironment() });
  }
  if (p[0] === "auth" && p[1] === "login" && method === "POST") {
    const data = z
      .object({
        email: z.string().email().max(254),
        password: z.string().min(1).max(512),
      })
      .parse(await body(req));
    repo.limit(`login:${data.email.toLowerCase()}`, 10, 15 * 60_000);
    await verifyLogin(data.email, data.password);
    const { store } = sellerStores();
    const ownerToken = repo.createSession(store.id);
    // Unchanged shape: older app builds save this whole response in SecureStore.
    // Clients fetch the storefront list from /stores.
    const response = json({ store, token: ownerToken });
    response.headers.set("Set-Cookie", sessionCookie(ownerToken));
    return response;
  }
  if (p[0] === "auth" && p[1] === "session" && method === "GET") {
    repo.session(token(req));
    const { store, stores } = sellerStores();
    return json({ store, stores });
  }
  if (p[0] === "auth" && p[1] === "logout" && method === "POST") {
    repo.revokeSession(token(req));
    const response = json({ signedOut: true });
    response.headers.set("Set-Cookie", sessionCookie("", true));
    return response;
  }
  if (p[0] === "maintenance" && method === "POST") {
    const secret = requireConfig("MAINTENANCE_SECRET");
    const incoming = token(req);
    if (
      !incoming ||
      !timingSafeEqual(
        createHash("sha256").update(incoming).digest(),
        createHash("sha256").update(secret).digest(),
      )
    )
      throw new AppError(401, "Unauthorized.");
    return json(await maintenance());
  }
  if (p[0] === "stores" && p.length === 1) {
    if (method === "GET") {
      repo.session(token(req));
      return json({ stores: sellerStores().stores });
    }
    if (method === "POST") {
      // Only the signed-in seller can add storefronts; there is no public signup.
      repo.session(token(req));
      const data = CreateStoreRequest.parse(await body(req));
      const { mode, environment } = sellerStores();
      const store = repo.addStore(
        environment,
        data.name,
        mode,
        data.requestKey,
      );
      return json({ store, stores: repo.sellerStores(environment) });
    }
  }
  if (p[0] === "stores" && p[1]) {
    const id = p[1];
    const currentStore = repo.store(id);
    if (!currentStore) throw new AppError(404, "Store not found.");
    assertStoreEnvironment(currentStore);
    if (method === "GET" && p.length === 2) {
      if (token(req)) {
        try {
          auth(req, id);
          return json(repo.snapshot(id));
        } catch {
          /* Public browsing is still allowed. */
        }
      }
      return json(repo.publicSnapshot(id));
    }
    if (method === "PATCH" && p.length === 2) {
      auth(req, id);
      const { name } = z
        .object({ name: z.string().trim().min(2).max(60) })
        .parse(await body(req));
      repo.rename(id, name);
      await syncInventory();
      return json(repo.snapshot(id));
    }
    if (method === "DELETE" && p.length === 2) {
      auth(req, id);
      const { name } = DeleteStoreRequest.parse(await body(req));
      if (name !== currentStore.name)
        throw new AppError(
          400,
          "Type the storefront's name exactly as shown to delete it.",
        );
      // Close first so no checkout or publish starts while Square catalog items are removed.
      // If Square fails, the storefront stays closed and the seller retries the delete.
      const { catalogIds, publishing } = repo.closeStore(id);
      for (const pending of publishing)
        for (const item of await createCatalog(pending.items, pending.key))
          catalogIds.push(item.catalogId);
      await deleteCatalog(catalogIds);
      repo.deleteStore(id, process.env.BUSINESS_NAME || "My store");
      await syncInventory();
      const { store, stores } = sellerStores();
      return json({ deleted: id, store, stores });
    }
    if (method === "GET" && p[2] === "qr") {
      repo.snapshot(id);
      return new Response(
        await QRCode.toString(`${validBase(req)}/s/${id}`, {
          type: "svg",
          margin: 2,
          color: { dark: "#173e35", light: "#ffffff" },
        }),
        {
          headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (method === "GET" && p[2] === "narration") {
      const snap = repo.snapshot(id);
      const language = url.searchParams.get("language") === "es" ? "es" : "en";
      if (url.searchParams.get("text") === "1")
        return json({ text: narration(snap, language) });
      const key = `${id}:${snap.store.revision}:${language}`;
      const cached = audioCache.get(key);
      if (cached && cached.at > Date.now() - 300_000)
        return new Response(cached.data, {
          headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
        });
      rateLimit(`audio:${id}`, 5);
      // Deployment-wide ceiling so more storefronts do not multiply Cartesia spend.
      rateLimit("audio", 10);
      const data = await speak(
        narration(snap, language).slice(0, 5000),
        language,
      );
      if (audioCache.size > 20)
        audioCache.delete(audioCache.keys().next().value!);
      audioCache.set(key, { data, at: Date.now() });
      return new Response(data, {
        headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
      });
    }
  }
  if (method === "POST" && p[0] === "scan") {
    // Authenticate before buffering a large upload or making a paid model request.
    const id = url.searchParams.get("storeId") || "";
    auth(req, id);
    // Provider limits apply to the seller, not each storefront.
    rateLimit("seller:scan", 6);
    const raw = await bytes(req, 10 * 1024 * 1024 + 8192);
    let form: FormData;
    try {
      form = await new Response(raw as BodyInit, {
        headers: { "Content-Type": req.headers.get("content-type") || "" },
      }).formData();
    } catch {
      throw new AppError(400, "Send a photo as multipart form data.");
    }
    const file = form.get("photo");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      throw new AppError(400, "Choose a JPEG, PNG, or WebP image.");
    if (file.size > 10 * 1024 * 1024 || !file.size)
      throw new AppError(400, "Choose a photo smaller than 10 MB.");
    const image = await prepareImage(Buffer.from(await file.arrayBuffer()));
    const items = await scanPhoto(image);
    const photoId = repo.savePhoto(id, image);
    return json({
      items: items.map((i) => ({ ...i, photoId })),
      mode: "live",
      message: items.length
        ? "Review every name, quantity, and price before publishing."
        : "No sellable items found. Try a closer photo with better lighting.",
    });
  }
  if (method === "GET" && p[0] === "photos" && p[1]) {
    const storedPhoto = repo.photo(p[1]);
    if (storedPhoto) assertStoreEnvironment(repo.store(storedPhoto.store_id)!);
    let photo = repo.publishedPhoto(p[1]);
    if (!photo && storedPhoto && token(req)) {
      auth(req, storedPhoto.store_id);
      photo = storedPhoto.bytes;
    }
    if (!photo) throw new AppError(404, "Photo not found.");
    return new Response(photo as BodyInit, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (method === "POST" && p[0] === "compare") {
    const data = z
      .object({ storeId: z.string(), name: z.string().trim().min(2).max(100) })
      .parse(await body(req));
    auth(req, data.storeId);
    rateLimit("seller:compare", 8);
    return json(await comparePrices(data.name));
  }
  if (method === "POST" && p[0] === "publish") {
    const data = PublishRequest.parse(await body(req));
    auth(req, data.storeId);
    requirePayments();
    let publish = repo.beginPublish(data.storeId, data.requestKey, data.items);
    if (publish.state !== "done") {
      publish = {
        ...publish,
        items: await createCatalog(publish.items, data.requestKey),
      };
      repo.finishPublish(data.storeId, data.requestKey, publish.items);
    }
    await syncInventory();
    return json({
      ...repo.snapshot(data.storeId),
      url: `${validBase(req)}/s/${data.storeId}`,
    });
  }
  if (method === "POST" && p[0] === "checkout") {
    const data = CheckoutRequest.parse(await body(req));
    const store = repo.store(data.storeId);
    if (!store) throw new AppError(404, "Store not found.");
    assertStoreEnvironment(store);
    requirePayments();
    const order = repo.reserve(data.storeId, data.requestKey, data.lines);
    if (order.state === "failed")
      throw new AppError(409, "Start a new checkout.");
    if (order.state === "paid")
      return json({
        orderId: order.id,
        url: `${validBase(req)}/pay/${order.id}`,
        mode: order.mode,
      });
    if (order.paymentUrl)
      return json({
        orderId: order.id,
        url: order.paymentUrl,
        mode: order.mode,
      });
    // A timeout may mean Square created the link. Keep stock reserved and reuse the same idempotency key.
    const link = await createPaymentLink(order, validBase(req));
    const result = repo.linkOrder(order.id, link);
    await syncInventory();
    return json({
      orderId: result.id,
      url: result.paymentUrl,
      mode: result.mode,
    });
  }
  if (p[0] === "orders" && p[1]) {
    let order = repo.order(p[1]);
    if (!order) throw new AppError(404, "Order not found.");
    assertStoreEnvironment(repo.store(order.storeId)!);
    if (method === "GET" && p.length === 2) {
      if (
        order.state === "pending" &&
        repo.acquireJob(`order:${order.id}`, 15_000)
      ) {
        try {
          await reconcileOrder(order);
        } catch {
          /* Durable maintenance retries; never claim payment on failure. */
        }
        order = repo.order(order.id)!;
      }
      return json({
        id: order.id,
        storeId: order.storeId,
        lines: order.lines.map(({ name, price, quantity }) => ({
          name,
          price,
          quantity,
        })),
        subtotalCents: order.subtotalCents,
        taxCents: order.taxCents,
        totalCents: order.totalCents,
        state: order.state,
        mode: order.mode,
        paymentUrl: order.state === "pending" ? order.paymentUrl : undefined,
        receiptUrl: order.receiptUrl,
        expiresAt: order.expiresAt,
        pickup: business().pickup,
        supportEmail: business().email,
      });
    }
    if (method === "POST" && p[2] === "cancel" && p.length === 3) {
      // The order UUID is the buyer's unguessable receipt/cancellation capability.
      await cancelCheckout(order);
      await syncInventory();
      return json({ canceled: true });
    }
  }
  if (method === "POST" && p[0] === "webhooks" && p[1] === "square") {
    const raw = new TextDecoder().decode(await bytes(req));
    const notificationUrl =
      process.env.SQUARE_WEBHOOK_URL ||
      `${requireConfig("PUBLIC_BASE_URL").replace(/\/$/, "")}/api/webhooks/square`;
    if (
      !verifySquareSignature(
        raw,
        req.headers.get("x-square-hmacsha256-signature") || "",
        requireConfig("SQUARE_WEBHOOK_SIGNATURE_KEY"),
        notificationUrl,
      )
    )
      throw new AppError(401, "Invalid webhook signature.");
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new AppError(400, "Invalid webhook JSON.");
    }
    if (!["payment.created", "payment.updated"].includes(event.type))
      return json({ ignored: true });
    const payment = event.data?.object?.payment;
    if (!payment || typeof payment.id !== "string")
      throw new AppError(400, "Missing payment.");
    if (payment.status !== "COMPLETED") return json({ ignored: true });
    if (
      payment.location_id !== requireConfig("SQUARE_LOCATION_ID") ||
      payment.amount_money?.currency !== "USD"
    )
      throw new AppError(400, "Payment location or currency mismatch.");
    const order = repo.orderBySquare(payment.order_id);
    if (!order) {
      // A webhook can arrive before the CreatePaymentLink response is persisted.
      // Ask Square to redeliver instead of acknowledging and losing the payment.
      const remote = await square<{ order: { reference_id?: string } }>(
        `/orders/${payment.order_id}`,
        undefined,
        "GET",
      );
      if (remote.order.reference_id && repo.order(remote.order.reference_id))
        throw new AppError(
          503,
          "Checkout is still being linked. Retry this event.",
        );
      return json({ ignored: true });
    }
    acceptPayment(order, payment);
    await syncInventory();
    return json({ received: true });
  }
  throw new AppError(404, "Endpoint not found.");
}
export async function handle(req: Request) {
  let response: Response;
  try {
    response = await route(req);
  } catch (e) {
    if (e instanceof ZodError)
      response = json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    else if (e instanceof AppError)
      response = json({ error: e.message }, e.status);
    else {
      console.error(
        "Request failed",
        e instanceof Error ? e.name : "UnknownError",
      );
      response = json(
        {
          error:
            "Something went wrong. Please retry; your published store is safe.",
        },
        500,
      );
    }
  }
  const origin = req.headers.get("origin");
  if (origin && allowedOrigins(req).includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
  }
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (response.status === 429) response.headers.set("Retry-After", "60");
  return response;
}
