import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { repo } from "../repo";
import { publicBase, paymentEnvironment } from "./config";
import { AppError, requireConfig } from "./errors";
import {
  connectSquare,
  squareOAuthConfigured,
  squareOrigin,
} from "./square-accounts";
import { syncInventory } from "../providers/convex";
import { appleAuthorizeUrl, appleConfigured, appleIdentity } from "./apple";

type Client = "web" | "native";
type SignIn = "google" | "apple";
type Ticket = {
  kind: SignIn | "square" | "square-launch" | "session";
  client: Client;
  nonce?: string;
  verifier?: string;
  challenge?: string;
  storeId?: string;
  mode: string;
};
const random = () => randomBytes(32).toString("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("base64url");
function equal(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
function put(ticket: Ticket, ttl = 10 * 60_000) {
  const key = random();
  repo.db
    .prepare("DELETE FROM oauth_tickets WHERE expires_at < ?")
    .run(Date.now());
  repo.db
    .prepare("INSERT INTO oauth_tickets VALUES(?,?,?)")
    .run(hash(key), JSON.stringify(ticket), Date.now() + ttl);
  return key;
}
function take(
  key: string,
  kind: Ticket["kind"],
  validate?: (t: Ticket) => boolean,
): Ticket {
  return repo.db.transaction(() => {
    const row = repo.db
      .prepare("SELECT data FROM oauth_tickets WHERE hash=? AND expires_at>?")
      .get(hash(key), Date.now()) as { data: string } | undefined;
    const ticket: Ticket | undefined = row ? JSON.parse(row.data) : undefined;
    if (
      !ticket ||
      ticket.kind !== kind ||
      ticket.mode !== paymentEnvironment() ||
      (validate && !validate(ticket))
    )
      throw new AppError(
        400,
        "This sign-in request expired or is invalid. Please start again.",
      );
    repo.db.prepare("DELETE FROM oauth_tickets WHERE hash=?").run(hash(key));
    return ticket;
  })();
}
export function authMethods() {
  return {
    google: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    ),
    apple: appleConfigured(),
    password: Boolean(
      process.env.SELLER_EMAIL && process.env.SELLER_PASSWORD_HASH,
    ),
  };
}
function googleClient() {
  return new OAuth2Client({
    clientId: requireConfig("GOOGLE_CLIENT_ID"),
    clientSecret: requireConfig("GOOGLE_CLIENT_SECRET"),
    redirectUri: publicBase() + "/api/auth/google/callback",
    transporterOptions: { timeout: 20000 },
  });
}
function cookie(value: string, expire = false) {
  return `snap_oauth=${value}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${expire ? 0 : 600}${publicBase().startsWith("https:") ? "; Secure" : ""}`;
}
function redirect(destination: string, state?: string) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: destination,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie": cookie(state || "", !state),
    },
  });
}
export function sessionCookie(value: string, expired = false) {
  return `snap_owner=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expired ? 0 : 2592000}${publicBase().startsWith("https:") ? "; Secure" : ""}`;
}
const appleRedirect = () => publicBase() + "/api/auth/apple/callback";
export function startSignIn(url: URL, provider: SignIn) {
  const client: Client =
    url.searchParams.get("client") === "native" ? "native" : "web";
  const challenge = url.searchParams.get("code_challenge") || undefined;
  if (client === "native" && !/^[A-Za-z0-9_-]{43}$/.test(challenge || ""))
    throw new AppError(400, "A valid mobile sign-in challenge is required.");
  if (provider === "apple" && !appleConfigured())
    throw new AppError(503, "Apple sign-in has not been configured.");
  const nonce = random(),
    verifier = random();
  const state = put({
    kind: provider,
    client,
    nonce,
    verifier,
    challenge,
    mode: paymentEnvironment(),
  });
  if (provider === "apple")
    return redirect(appleAuthorizeUrl(appleRedirect(), state, nonce), state);
  const google = googleClient();
  const target = new URL(
    google.generateAuthUrl({
      scope: ["openid", "email", "profile"],
      state,
      nonce,
      prompt: "select_account",
    }),
  );
  target.searchParams.set("code_challenge", hash(verifier));
  target.searchParams.set("code_challenge_method", "S256");
  return redirect(target.toString(), state);
}
export function squareLaunch(storeId: string, client: Client) {
  const store = repo.store(storeId);
  if (!store || store.paymentProvider !== "square_oauth")
    throw new AppError(
      403,
      "This store uses its administrator's payment connection.",
    );
  if (!squareOAuthConfigured())
    throw new AppError(
      503,
      "Square account connections have not been configured on the server.",
    );
  const ticket = put(
    { kind: "square-launch", client, storeId, mode: paymentEnvironment() },
    60_000,
  );
  return { url: publicBase() + "/api/auth/square/authorize?ticket=" + ticket };
}
export function authorizeSquare(url: URL) {
  const launch = take(url.searchParams.get("ticket") || "", "square-launch");
  const state = put({ ...launch, kind: "square" });
  const target = new URL(squareOrigin() + "/oauth2/authorize");
  target.search = new URLSearchParams({
    client_id: requireConfig("SQUARE_APPLICATION_ID"),
    scope:
      "MERCHANT_PROFILE_READ ITEMS_READ ITEMS_WRITE ORDERS_READ ORDERS_WRITE PAYMENTS_READ PAYMENTS_WRITE",
    session: "false",
    state,
    redirect_uri: publicBase() + "/api/auth/square/callback",
  }).toString();
  return redirect(target.toString(), state);
}
function callbackTicket(req: Request, kind: SignIn | "square") {
  const url = new URL(req.url),
    state = url.searchParams.get("state") || "";
  const browserState =
    req.headers
      .get("cookie")
      ?.split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("snap_oauth="))
      ?.slice(11) || "";
  if (!state || !browserState || !equal(state, browserState))
    throw new AppError(
      400,
      "Sign-in could not be verified. Start again from the app.",
    );
  return take(state, kind);
}
// Use the stable subject, never an email match, to select an account.
async function googleStore(code: string, ticket: Ticket) {
  const client = googleClient();
  const { tokens } = await client.getToken({
    code,
    codeVerifier: ticket.verifier,
  });
  if (!tokens.id_token)
    throw new AppError(401, "Google did not return an identity token.");
  const identity = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: requireConfig("GOOGLE_CLIENT_ID"),
  });
  const payload = identity.getPayload();
  if (
    !payload?.sub ||
    !payload.email ||
    payload.email_verified !== true ||
    !equal(String(payload.nonce || ""), ticket.nonce || "")
  )
    throw new AppError(401, "Google could not verify this account.");
  return repo.googleStore(
    payload.sub,
    (payload.given_name ? payload.given_name + "'s store" : "My store").slice(
      0,
      60,
    ),
    paymentEnvironment(),
  );
}
async function appleStore(code: string, ticket: Ticket) {
  const identity = await appleIdentity(code, appleRedirect());
  if (!ticket.nonce || !equal(identity.nonce, ticket.nonce))
    throw new AppError(401, "Apple could not verify this account.");
  // Apple subjects share the federated account table under their own prefix;
  // Google subjects are numeric, so the two can never collide.
  return repo.googleStore(
    "apple:" + identity.sub,
    "My store",
    paymentEnvironment(),
  );
}
export async function oauthCallback(
  req: Request,
  provider: SignIn | "square",
) {
  const ticket = callbackTicket(req, provider),
    url = new URL(req.url);
  const destination = new URL(
    ticket.client === "native"
      ? provider === "square"
        ? "snapastore://square"
        : "snapastore://auth"
      : publicBase() + "/studio",
  );
  try {
    if (url.searchParams.has("error"))
      throw new AppError(400, "Authorization was canceled. Please try again.");
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096)
      throw new AppError(
        400,
        "The provider did not return an authorization code.",
      );
    if (provider === "square") {
      await connectSquare(
        ticket.storeId!,
        code,
        publicBase() + "/api/auth/square/callback",
      );
      await syncInventory();
      destination.searchParams.set("square", "connected");
      return redirect(destination.toString());
    }
    const store =
      provider === "apple"
        ? await appleStore(code, ticket)
        : await googleStore(code, ticket);
    if (ticket.client === "native") {
      const grant = put(
        {
          kind: "session",
          client: "native",
          storeId: store.id,
          challenge: ticket.challenge,
          mode: paymentEnvironment(),
        },
        60_000,
      );
      destination.searchParams.set("code", grant);
      return redirect(destination.toString());
    }
    const response = redirect(destination.toString());
    response.headers.append(
      "Set-Cookie",
      sessionCookie(repo.createSession(store.id, "google")),
    );
    return response;
  } catch (e) {
    destination.searchParams.set(
      "auth_error",
      e instanceof AppError
        ? e.message
        : "Authorization could not finish. Please try again.",
    );
    return redirect(destination.toString());
  }
}
export function exchangeNative(code: string, verifier: string) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
    throw new AppError(400, "Invalid sign-in verifier.");
  const ticket = take(code, "session", (t) =>
    Boolean(t.challenge && equal(hash(verifier), t.challenge)),
  );
  const store = repo.store(ticket.storeId!)!;
  return { store, token: repo.createSession(store.id, "google") };
}
