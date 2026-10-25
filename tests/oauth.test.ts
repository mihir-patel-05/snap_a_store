import {
  beforeEach,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createHash,
  createHmac,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import { OAuth2Client, LoginTicket } from "google-auth-library";
import { handle } from "../lib/server/api";
import { repo } from "../lib/repo";
import {
  squareAccessToken,
  connectSquare,
  selectLocation,
  encryptTokens,
} from "../lib/server/square-accounts";
import { square } from "../lib/providers/square";
import { requirePayments } from "../lib/server/config";
import { fixtureItems } from "./fixtures/items";
const base = "https://snap.example";
const settings = {
  email: "owner@example.com",
  pickup: "Collect at our table.",
  returns: "Ask the seller.",
  taxPercent: "0",
};
beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const [k, v] of Object.entries({
    PUBLIC_BASE_URL: base,
    SQUARE_ENVIRONMENT: "production",
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    SQUARE_APPLICATION_ID: "square-app",
    SQUARE_APPLICATION_SECRET: "square-secret",
    OAUTH_ENCRYPTION_KEY: "ab".repeat(32),
    SQUARE_WEBHOOK_SIGNATURE_KEY: "webhook-key",
    SQUARE_ACCESS_TOKEN: "legacy-token",
    SQUARE_LOCATION_ID: "legacy-location",
    SELLER_EMAIL: "owner@example.com",
    SELLER_PASSWORD_HASH: "legacy-password-hash",
  }))
    vi.stubEnv(k, v);
  repo.db.exec(
    "DELETE FROM oauth_tickets; DELETE FROM google_accounts; DELETE FROM square_connections; DELETE FROM limits; DELETE FROM jobs; DELETE FROM sessions; DELETE FROM primary_stores; DELETE FROM outbox; DELETE FROM activity; DELETE FROM publishes; DELETE FROM photos; DELETE FROM orders; DELETE FROM items; DELETE FROM seller_stores; DELETE FROM convex_removals; DELETE FROM stores;",
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(() => repo.close());
const get = (path: string, cookie?: string) =>
  handle(
    new Request(base + "/api" + path, { headers: cookie ? { cookie } : {} }),
  );
const post = (path: string, body: unknown, token?: string, method = "POST") =>
  handle(
    new Request(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
async function begin(query = "") {
  const r = await get("/auth/google/start" + query);
  expect(r.status).toBe(303);
  const target = new URL(r.headers.get("location")!);
  return {
    state: target.searchParams.get("state")!,
    nonce: target.searchParams.get("nonce")!,
    cookie: r.headers.get("set-cookie")!.split(";")[0],
    target,
  };
}
function googleIdentity(
  nonce: string,
  subject = "google-user-1",
  email = "owner@example.com",
) {
  vi.spyOn(OAuth2Client.prototype, "getToken").mockResolvedValue({
    tokens: { id_token: "signed-google-token" },
    res: null,
  } as never);
  vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue(
    new LoginTicket("", {
      iss: "https://accounts.google.com",
      aud: "google-client",
      sub: subject,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      email,
      email_verified: true,
      nonce,
      given_name: "Alex",
    }) as never,
  );
}
async function webLogin(subject = "google-user-1") {
  const flow = await begin();
  googleIdentity(flow.nonce, subject);
  const r = await get(
    "/auth/google/callback?state=" + flow.state + "&code=code",
    flow.cookie,
  );
  const token = r.headers
    .getSetCookie()
    .find((c) => c.startsWith("snap_owner="))!
    .split(";")[0]
    .slice(11);
  return { token, store: repo.session(token), flow, response: r };
}
function tokenReply(merchant = "merchant-1", token = "seller-token") {
  return {
    access_token: token,
    refresh_token: "refresh-" + merchant,
    merchant_id: merchant,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  };
}
function squareMock(merchant = "merchant-1", location = "location-1") {
  const fetch = vi.fn(async (url: string | URL | Request) => {
    const s = String(url);
    if (s.endsWith("/oauth2/token")) return Response.json(tokenReply(merchant));
    if (s.endsWith("/v2/locations"))
      return Response.json({
        locations: [
          {
            id: location,
            name: "My shop",
            status: "ACTIVE",
            currency: "USD",
            capabilities: ["CREDIT_CARD_PROCESSING"],
          },
        ],
      });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
describe("Google signup and isolated seller sessions", () => {
  it("creates a separate store by Google subject and reuses it across logins without email linking", async () => {
    const legacy = repo.primaryStore(
      "production:legacy-location",
      "Existing store",
      "production",
    );
    const first = await webLogin();
    expect(first.store.id).not.toBe(legacy.id);
    expect(first.store.paymentProvider).toBe("square_oauth");
    expect(first.store.locationId).toBeUndefined();
    expect(first.response.headers.getSetCookie().join(";")).toContain(
      "HttpOnly",
    );
    expect((await webLogin()).store.id).toBe(first.store.id);
    const second = await webLogin("google-user-2");
    expect(second.store.id).not.toBe(first.store.id);
    expect(
      (
        await post(
          "/stores/" + first.store.id + "/square/connect",
          {},
          second.token,
        )
      ).status,
    ).toBe(403);
    vi.stubEnv("SELLER_PASSWORD_HASH", "changed");
    expect(repo.session(first.token).id).toBe(first.store.id);
  });
  it("rejects missing state cookies, reused callbacks, and expired flows", async () => {
    const flow = await begin();
    googleIdentity(flow.nonce);
    const path = "/auth/google/callback?state=" + flow.state + "&code=code";
    expect((await get(path)).status).toBe(400);
    expect((await get(path, "snap_oauth=wrong")).status).toBe(400);
    expect((await get(path, flow.cookie)).status).toBe(303);
    expect((await get(path, flow.cookie)).status).toBe(400);
    const expired = await begin();
    repo.db.prepare("UPDATE oauth_tickets SET expires_at=0").run();
    expect(
      (
        await get(
          "/auth/google/callback?state=" + expired.state + "&code=code",
          expired.cookie,
        )
      ).status,
    ).toBe(400);
  });
  it("does not create a session when Google rejects the token, or when the nonce is wrong", async () => {
    const flow = await begin();
    googleIdentity("wrong-nonce");
    const r = await get(
      "/auth/google/callback?state=" + flow.state + "&code=code",
      flow.cookie,
    );
    expect(
      new URL(r.headers.get("location")!).searchParams.get("auth_error"),
    ).toContain("verify");
    expect(
      repo.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toEqual({ count: 0 });
    const second = await begin();
    googleIdentity(second.nonce);
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockRejectedValue(
      new Error("invalid audience/signature"),
    );
    const failed = await get(
      "/auth/google/callback?state=" + second.state + "&code=code",
      second.cookie,
    );
    expect(failed.headers.get("location")).toContain("auth_error");
    expect(
      repo.db.prepare("SELECT COUNT(*) AS count FROM google_accounts").get(),
    ).toEqual({ count: 0 });
  });
  it("binds one-time mobile grants to PKCE and returns no session token in the callback URL", async () => {
    const verifier = "a".repeat(64),
      challenge = createHash("sha256").update(verifier).digest("base64url");
    const flow = await begin("?client=native&code_challenge=" + challenge);
    googleIdentity(flow.nonce);
    const callback = await get(
      "/auth/google/callback?state=" + flow.state + "&code=code",
      flow.cookie,
    );
    const destination = new URL(callback.headers.get("location")!);
    expect(destination.protocol).toBe("snapastore:");
    expect(destination.searchParams.has("token")).toBe(false);
    const code = destination.searchParams.get("code");
    expect(
      (await post("/auth/google/exchange", { code, verifier: "b".repeat(64) }))
        .status,
    ).toBe(400);
    const result = await post("/auth/google/exchange", { code, verifier });
    expect(result.status).toBe(200);
    const session = await result.json();
    expect(repo.session(session.token).id).toBe(session.store.id);
    expect(
      (await post("/auth/google/exchange", { code, verifier })).status,
    ).toBe(400);
  });
});
describe("Sign in with Apple", () => {
  // Apple's ID-token signing key (RS256) and the seller's .p8 key (ES256).
  const appleSigning = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const p8 = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = {
    ...appleSigning.publicKey.export({ format: "jwk" }),
    kid: "apple-kid",
    alg: "RS256",
    use: "sig",
  };
  const part = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  function idToken(
    claims: Record<string, unknown>,
    key = appleSigning.privateKey,
  ) {
    const input =
      part({ alg: "RS256", kid: "apple-kid" }) +
      "." +
      part({
        iss: "https://appleid.apple.com",
        aud: "com.snapastore.web",
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        ...claims,
      });
    return (
      input +
      "." +
      sign("sha256", Buffer.from(input), key).toString("base64url")
    );
  }
  function apple(token: () => string) {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const s = String(url);
      if (s === "https://appleid.apple.com/auth/keys")
        return Response.json({ keys: [jwk] });
      if (s === "https://appleid.apple.com/auth/token")
        return Response.json({ id_token: token() });
      throw new Error("Unexpected call: " + s);
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }
  beforeEach(() => {
    vi.stubEnv("APPLE_SERVICES_ID", "com.snapastore.web");
    vi.stubEnv("APPLE_TEAM_ID", "TEAM123456");
    vi.stubEnv("APPLE_KEY_ID", "KEY1234567");
    // Hosted variables keep the .p8 file on one line with \n escapes.
    vi.stubEnv(
      "APPLE_PRIVATE_KEY",
      String(p8.privateKey.export({ format: "pem", type: "pkcs8" })).replace(
        /\n/g,
        "\\n",
      ),
    );
  });
  async function beginApple(query = "") {
    const r = await get("/auth/apple/start" + query);
    expect(r.status).toBe(303);
    const target = new URL(r.headers.get("location")!);
    return {
      state: target.searchParams.get("state")!,
      nonce: target.searchParams.get("nonce")!,
      cookie: r.headers.get("set-cookie")!.split(";")[0],
      target,
    };
  }
  async function appleLogin(subject: string) {
    const flow = await beginApple();
    const fetch = apple(() => idToken({ sub: subject, nonce: flow.nonce }));
    const r = await get(
      "/auth/apple/callback?state=" + flow.state + "&code=apple-code",
      flow.cookie,
    );
    const cookie = r.headers
      .getSetCookie()
      .find((c) => c.startsWith("snap_owner="));
    return { r, fetch, token: cookie?.split(";")[0].slice(11) };
  }
  it("advertises Apple and asks for no name or email, so the callback is a GET", async () => {
    expect(await (await get("/auth/methods")).json()).toMatchObject({
      apple: true,
    });
    const { target } = await beginApple();
    expect(target.origin + target.pathname).toBe(
      "https://appleid.apple.com/auth/authorize",
    );
    expect(target.searchParams.get("client_id")).toBe("com.snapastore.web");
    expect(target.searchParams.get("redirect_uri")).toBe(
      base + "/api/auth/apple/callback",
    );
    expect(target.searchParams.get("response_mode")).toBe("query");
    expect(target.searchParams.has("scope")).toBe(false);
  });
  it("signs the client secret with the .p8 key and creates one store per Apple subject", async () => {
    const { r, fetch, token } = await appleLogin("001234.apple-user");
    expect(r.headers.get("location")).toBe(base + "/studio");
    const store = repo.session(token!);
    expect(store.paymentProvider).toBe("square_oauth");
    const body = new URLSearchParams(
      String(
        (
          fetch.mock.calls.find(
            (c) => String(c[0]) === "https://appleid.apple.com/auth/token",
          ) as unknown as [string, RequestInit]
        )[1].body,
      ),
    );
    expect(body.get("redirect_uri")).toBe(base + "/api/auth/apple/callback");
    const [header, claims, signature] = body.get("client_secret")!.split(".");
    expect(
      verify(
        "sha256",
        Buffer.from(header + "." + claims),
        { key: createPublicKey(p8.privateKey), dsaEncoding: "ieee-p1363" },
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEY1234567",
    });
    expect(
      JSON.parse(Buffer.from(claims, "base64url").toString()),
    ).toMatchObject({
      iss: "TEAM123456",
      sub: "com.snapastore.web",
      aud: "https://appleid.apple.com",
    });
    expect(repo.session((await appleLogin("001234.apple-user")).token!).id).toBe(
      store.id,
    );
    const other = repo.session((await appleLogin("009999.other")).token!);
    expect(other.id).not.toBe(store.id);
    // An Apple subject never opens a Google seller's store.
    expect((await webLogin("001234.apple-user")).store.id).not.toBe(store.id);
  });
  it("rejects a wrong nonce, a forged signature, and another app's audience", async () => {
    for (const forged of [
      (nonce: string) => idToken({ sub: "user", nonce: nonce + "x" }),
      (nonce: string) =>
        idToken(
          { sub: "user", nonce },
          generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey,
        ),
      (nonce: string) => idToken({ sub: "user", nonce, aud: "other.app" }),
    ]) {
      const flow = await beginApple();
      apple(() => forged(flow.nonce));
      const r = await get(
        "/auth/apple/callback?state=" + flow.state + "&code=apple-code",
        flow.cookie,
      );
      expect(
        new URL(r.headers.get("location")!).searchParams.get("auth_error"),
      ).toContain("Apple could not verify");
    }
    expect(
      repo.db.prepare("SELECT COUNT(*) AS count FROM sessions").get(),
    ).toEqual({ count: 0 });
  });
  it("returns canceled Apple sign-ins and mobile grants to the app", async () => {
    const canceled = await beginApple();
    const r = await get(
      "/auth/apple/callback?state=" +
        canceled.state +
        "&error=user_cancelled_authorize",
      canceled.cookie,
    );
    expect(r.headers.get("location")).toContain("auth_error=Authorization");
    const verifier = "c".repeat(64),
      challenge = createHash("sha256").update(verifier).digest("base64url");
    const flow = await beginApple("?client=native&code_challenge=" + challenge);
    apple(() => idToken({ sub: "mobile-user", nonce: flow.nonce }));
    const callback = await get(
      "/auth/apple/callback?state=" + flow.state + "&code=apple-code",
      flow.cookie,
    );
    const destination = new URL(callback.headers.get("location")!);
    expect(destination.href.startsWith("snapastore://auth")).toBe(true);
    const result = await post("/auth/google/exchange", {
      code: destination.searchParams.get("code"),
      verifier,
    });
    expect(result.status).toBe(200);
  });
  it("is unavailable until every Apple variable is set", async () => {
    vi.stubEnv("APPLE_KEY_ID", "");
    expect(await (await get("/auth/methods")).json()).toMatchObject({
      apple: false,
    });
    expect((await get("/auth/apple/start")).status).toBe(503);
  });
});
describe("Per-seller Square onboarding and payment routing", () => {
  it("requires authentication and never gives new sellers the deployment's Square token", async () => {
    const { store, token } = await webLogin();
    expect(() => requirePayments(store)).toThrow("Connect your Square");
    await expect(squareAccessToken(store.id)).rejects.toThrow(
      "Connect your Square",
    );
    expect(
      (await post("/stores/" + store.id + "/square/connect", {})).status,
    ).toBe(401);
    const launch = await (
      await post(
        "/stores/" + store.id + "/square/connect",
        { client: "web" },
        token,
      )
    ).json();
    const authorized = await handle(new Request(launch.url));
    expect(authorized.status).toBe(303);
    const target = new URL(authorized.headers.get("location")!);
    expect(target.hostname).toBe("connect.squareup.com");
    expect((await handle(new Request(launch.url))).status).toBe(400);
    const mocked = squareMock();
    const callback = await get(
      "/auth/square/callback?state=" +
        target.searchParams.get("state") +
        "&code=sq-code",
      authorized.headers.get("set-cookie")!.split(";")[0],
    );
    expect(callback.headers.get("location")).toContain("square=connected");
    expect(repo.store(store.id)?.locationId).toBe("location-1");
    const stored = repo.db
      .prepare("SELECT encrypted FROM square_connections WHERE store_id=?")
      .get(store.id) as { encrypted: string };
    expect(stored.encrypted).not.toContain("seller-token");
    await square("/orders/test", undefined, "GET", store.id);
    expect(
      (mocked.mock.calls.at(-1) as unknown as [string, RequestInit])[1].headers,
    ).toMatchObject({ Authorization: "Bearer seller-token" });
  });
  it("keeps settings private to their owner and binds encrypted tokens to the correct store", async () => {
    const a = await webLogin("A"),
      b = await webLogin("B");
    squareMock();
    await connectSquare(a.store.id, "code", base + "/api/auth/square/callback");
    const r = await post(
      "/stores/" + a.store.id + "/square",
      { business: settings },
      a.token,
      "PATCH",
    );
    expect(r.status).toBe(200);
    expect(
      (
        await post(
          "/stores/" + a.store.id + "/square",
          { business: settings },
          b.token,
          "PATCH",
        )
      ).status,
    ).toBe(403);
    expect(repo.store(b.store.id)?.business).toBeUndefined();
    const cipher = (
      repo.db
        .prepare("SELECT encrypted FROM square_connections WHERE store_id=?")
        .get(a.store.id) as { encrypted: string }
    ).encrypted;
    repo.db
      .prepare("INSERT INTO square_connections VALUES(?,?,?)")
      .run(b.store.id, "merchant-1", cipher);
    await expect(squareAccessToken(b.store.id)).rejects.toThrow(
      "cannot be read",
    );
  });
  it("refreshes expired seller tokens and prevents merchant or location changes after publishing", async () => {
    const { store } = await webLogin();
    squareMock();
    await connectSquare(store.id, "code", base + "/api/auth/square/callback");
    const expired = {
      ...tokenReply(),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    };
    repo.db
      .prepare("UPDATE square_connections SET encrypted=? WHERE store_id=?")
      .run(encryptTokens(store.id, expired), store.id);
    expect(await squareAccessToken(store.id)).toBe("seller-token");
    const key = randomUUID(),
      batch = repo.beginPublish(store.id, key, fixtureItems);
    repo.finishPublish(store.id, key, batch.items);
    squareMock("other-merchant", "location-2");
    await expect(
      connectSquare(store.id, "code", base + "/api/auth/square/callback"),
    ).rejects.toThrow("same Square merchant");
    await expect(selectLocation(store.id, "location-2")).rejects.toThrow(
      "cannot change",
    );
    expect(repo.store(store.id)?.merchantId).toBe("merchant-1");
  });
  it("publishes and checks out two sellers using only their own tokens, locations, and tax settings", async () => {
    vi.stubEnv("SQUARE_ACCESS_TOKEN", "");
    vi.stubEnv("SQUARE_LOCATION_ID", "");
    const remoteOrders = new Map<
      string,
      { location_id: string; total: number; token: string }
    >();
    const catalogTokens: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        const data = init?.body ? JSON.parse(String(init.body)) : {};
        const bearer = new Headers(init?.headers).get("Authorization") || "";
        const seller = bearer.replace("Bearer token-", "");
        if (url.pathname === "/oauth2/token")
          return Response.json(
            tokenReply("merchant-" + data.code, "token-" + data.code),
          );
        if (url.pathname === "/v2/locations")
          return Response.json({
            locations: [
              {
                id: "location-" + seller,
                status: "ACTIVE",
                currency: "USD",
                capabilities: ["CREDIT_CARD_PROCESSING"],
              },
            ],
          });
        if (url.pathname === "/v2/catalog/batch-upsert") {
          catalogTokens.push(bearer);
          return Response.json({
            id_mappings: data.batches[0].objects.flatMap(
              (
                item: {
                  id: string;
                  item_data: { variations: { id: string }[] };
                },
                i: number,
              ) => [
                {
                  client_object_id: item.id,
                  object_id: seller + "-catalog-" + i,
                },
                {
                  client_object_id: item.item_data.variations[0].id,
                  object_id: seller + "-variation-" + i,
                },
              ],
            ),
          });
        }
        if (url.pathname === "/v2/online-checkout/payment-links") {
          expect(data.order.location_id).toBe("location-" + seller);
          expect(data.order.line_items[0].catalog_object_id).toBe(
            seller + "-variation-0",
          );
          const subtotal = data.order.line_items[0].base_price_money.amount;
          const tax = Math.round(
            (subtotal * Number(data.order.taxes?.[0].percentage || 0)) / 100,
          );
          const remoteId = "order-" + data.order.reference_id;
          remoteOrders.set(remoteId, {
            location_id: data.order.location_id,
            total: subtotal + tax,
            token: bearer,
          });
          return Response.json({
            payment_link: {
              id: "link-" + remoteId,
              order_id: remoteId,
              url: "https://square.link/" + remoteId,
            },
            related_resources: {
              orders: [
                {
                  total_money: { amount: subtotal + tax, currency: "USD" },
                  total_tax_money: { amount: tax, currency: "USD" },
                },
              ],
            },
          });
        }
        const remoteId = url.pathname.split("/").at(-1)!;
        const remote = remoteOrders.get(remoteId);
        if (remote && url.pathname.startsWith("/v2/orders/")) {
          expect(bearer).toBe(remote.token);
          return Response.json({
            order: { state: "COMPLETED", tenders: [{ payment_id: remoteId }] },
          });
        }
        if (remote && url.pathname.startsWith("/v2/payments/")) {
          expect(bearer).toBe(remote.token);
          return Response.json({
            payment: {
              id: "payment-" + remoteId,
              order_id: remoteId,
              location_id: remote.location_id,
              status: "COMPLETED",
              amount_money: { amount: remote.total, currency: "USD" },
            },
          });
        }
        throw new Error("Unexpected Square call: " + url.pathname);
      }),
    );
    for (const seller of ["A", "B"]) {
      const { store, token } = await webLogin(seller);
      await connectSquare(store.id, seller, base + "/api/auth/square/callback");
      const taxPercent = seller === "A" ? "5" : "10";
      repo.updateStore(store.id, { business: { ...settings, taxPercent } });
      const published = await post(
        "/publish",
        {
          storeId: store.id,
          requestKey: randomUUID(),
          items: [fixtureItems[0]],
        },
        token,
      );
      expect(published.status).toBe(200);
      const snapshot = await published.json();
      const checkout = await post("/checkout", {
        storeId: store.id,
        requestKey: randomUUID(),
        lines: [{ itemId: snapshot.items[0].id, quantity: 1 }],
      });
      expect(checkout.status).toBe(200);
      const { orderId } = await checkout.json();
      expect(repo.order(orderId)?.taxPercent).toBe(taxPercent);
      expect((await get("/orders/" + orderId)).status).toBe(200);
      expect(repo.order(orderId)?.state).toBe("paid");
      const publicStore = (await (await get("/stores/" + store.id)).json())
        .store;
      expect(publicStore.merchantId).toBeUndefined();
      expect(publicStore.locationId).toBeUndefined();
    }
    expect(catalogTokens).toEqual(["Bearer token-A", "Bearer token-B"]);
  });

  it("checks the webhook merchant and location against the order's seller", async () => {
    const { store } = await webLogin();
    squareMock();
    await connectSquare(store.id, "code", base + "/api/auth/square/callback");
    repo.updateStore(store.id, { business: settings });
    const key = randomUUID(),
      batch = repo.beginPublish(store.id, key, [fixtureItems[0]]);
    repo.finishPublish(store.id, key, batch.items);
    const order = repo.reserve(store.id, randomUUID(), [
      { itemId: batch.items[0].id, quantity: 1 },
    ]);
    repo.linkOrder(order.id, {
      squareOrderId: "square-order",
      paymentUrl: "https://square.link/test",
    });
    const event = (merchant: string) =>
      JSON.stringify({
        type: "payment.updated",
        merchant_id: merchant,
        data: {
          object: {
            payment: {
              id: "payment-1",
              order_id: "square-order",
              location_id: "location-1",
              status: "COMPLETED",
              amount_money: { amount: order.totalCents, currency: "USD" },
            },
          },
        },
      });
    async function send(merchant: string) {
      const raw = event(merchant);
      return handle(
        new Request(base + "/api/webhooks/square", {
          method: "POST",
          body: raw,
          headers: {
            "x-square-hmacsha256-signature": createHmac("sha256", "webhook-key")
              .update(base + "/api/webhooks/square" + raw)
              .digest("base64"),
          },
        }),
      );
    }
    expect((await send("wrong-merchant")).status).toBe(400);
    expect(repo.order(order.id)?.state).toBe("pending");
    expect((await send("merchant-1")).status).toBe(200);
    expect((await send("merchant-1")).status).toBe(200);
    expect(repo.order(order.id)?.state).toBe("paid");
  });
});
describe("Storefronts for Google sellers", () => {
  const remove = (id: string, name: string, token: string) =>
    post("/stores/" + id, { name }, token, "DELETE");
  const json = async (r: Promise<Response>) => (await r).json();
  it("keeps each seller's storefronts to themselves", async () => {
    const a = await webLogin("A"),
      b = await webLogin("B");
    const legacy = repo.primaryStore(
      "production:legacy-location",
      "Legacy store",
      "production",
    );
    const legacyToken = repo.createSession(legacy.id);
    expect(
      (
        await post(
          "/stores/" + a.store.id + "/square",
          { business: settings },
          a.token,
          "PATCH",
        )
      ).status,
    ).toBe(200);
    const created = await post(
      "/stores",
      { name: "Spring table", requestKey: randomUUID() },
      a.token,
    );
    expect(created.status).toBe(200);
    const { store, stores } = await created.json();
    // A new storefront keeps the seller's details but connects Square separately.
    expect(store).toMatchObject({
      paymentProvider: "square_oauth",
      business: settings,
    });
    expect(store.merchantId).toBeUndefined();
    expect(store.locationId).toBeUndefined();
    expect(stores.map((s: { id: string }) => s.id)).toEqual([
      a.store.id,
      store.id,
    ]);
    const session = await (
      await handle(
        new Request(base + "/api/auth/session", {
          headers: { Authorization: "Bearer " + a.token },
        }),
      )
    ).json();
    expect(session.store.id).toBe(a.store.id);
    expect(session.stores).toHaveLength(2);
    const listed = async (token: string) =>
      (
        await json(
          handle(
            new Request(base + "/api/stores", {
              headers: { Authorization: "Bearer " + token },
            }),
          ),
        )
      ).stores.map((s: { id: string }) => s.id);
    expect(await listed(b.token)).toEqual([b.store.id]);
    expect(await listed(legacyToken)).toEqual([legacy.id]);
    for (const token of [b.token, legacyToken]) {
      expect(
        (await post("/stores/" + store.id, { name: "Mine" }, token, "PATCH"))
          .status,
      ).toBe(403);
      expect((await remove(store.id, "Spring table", token)).status).toBe(403);
    }
    expect((await remove(legacy.id, "Legacy store", a.token)).status).toBe(403);
    expect(repo.store(store.id)?.name).toBe("Spring table");
    expect(
      (
        await handle(
          new Request(base + "/api/stores/" + store.id + "/square", {
            headers: { Authorization: "Bearer " + a.token },
          }),
        )
      ).status,
    ).toBe(200);
  });
  it("deletes a seller's storefront with their own Square token and keeps them signed in", async () => {
    const a = await webLogin("A");
    const fetch = squareMock();
    await connectSquare(a.store.id, "code", base + "/api/auth/square/callback");
    const key = randomUUID();
    const batch = repo.beginPublish(a.store.id, key, [fixtureItems[1]]);
    repo.finishPublish(
      a.store.id,
      key,
      batch.items.map((i) => ({ ...i, catalogId: "seller-item" })),
    );
    const second = (
      await json(
        post(
          "/stores",
          { name: "Second table", requestKey: randomUUID() },
          a.token,
        ),
      )
    ).store;
    const response = await remove(a.store.id, a.store.name, a.token);
    expect(response.status).toBe(200);
    expect((await response.json()).store.id).toBe(second.id);
    const call = fetch.mock.calls.find((c) =>
      String(c[0]).endsWith("/v2/catalog/batch-delete"),
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toEqual({
      object_ids: ["seller-item"],
    });
    expect((call[1].headers as Record<string, string>).Authorization).toBe(
      "Bearer seller-token",
    );
    expect(
      repo.db
        .prepare("SELECT 1 FROM square_connections WHERE store_id=?")
        .get(a.store.id),
    ).toBeUndefined();
    expect(repo.session(a.token).id).toBe(second.id);
    const last = await remove(second.id, "Second table", a.token);
    expect(last.status).toBe(200);
    const fresh = (await last.json()).store;
    expect(fresh).toMatchObject({ paymentProvider: "square_oauth" });
    expect(fresh.id).not.toBe(second.id);
    expect(repo.session(a.token).id).toBe(fresh.id);
    // Signing in again opens the replacement storefront, not a new account.
    expect((await webLogin("A")).store.id).toBe(fresh.id);
  });
});
