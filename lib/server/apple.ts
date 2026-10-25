import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type JsonWebKey,
} from "node:crypto";
import { AppError, requireConfig } from "./errors";

const issuer = "https://appleid.apple.com";
export const APPLE_KEYS = [
  "APPLE_SERVICES_ID",
  "APPLE_TEAM_ID",
  "APPLE_KEY_ID",
  "APPLE_PRIVATE_KEY",
];
export const appleConfigured = () => APPLE_KEYS.every((k) => process.env[k]);
const encode = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");
function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

export function applePrivateKey() {
  // Hosted variables often store the .p8 file on one line with \n escapes.
  const pem = requireConfig("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  try {
    return createPrivateKey(pem);
  } catch {
    throw new AppError(
      503,
      "APPLE_PRIVATE_KEY must contain the .p8 key downloaded from Apple.",
    );
  }
}
// Apple's client secret is a short-lived ES256 JWT signed with the .p8 key.
export function appleClientSecret(now = Math.floor(Date.now() / 1000)) {
  const input =
    encode({ alg: "ES256", kid: requireConfig("APPLE_KEY_ID") }) +
    "." +
    encode({
      iss: requireConfig("APPLE_TEAM_ID"),
      iat: now,
      exp: now + 300,
      aud: issuer,
      sub: requireConfig("APPLE_SERVICES_ID"),
    });
  const signature = sign("sha256", Buffer.from(input), {
    key: applePrivateKey(),
    dsaEncoding: "ieee-p1363",
  });
  return input + "." + signature.toString("base64url");
}
// No scopes are requested: the stable subject identifies the store, and Apple
// only allows a GET (query) callback when name and email are not requested.
export function appleAuthorizeUrl(
  redirectUri: string,
  state: string,
  nonce: string,
) {
  const target = new URL(issuer + "/auth/authorize");
  target.search = new URLSearchParams({
    client_id: requireConfig("APPLE_SERVICES_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    state,
    nonce,
  }).toString();
  return target.toString();
}

type AppleKey = JsonWebKey & { kid: string };
let cached: { at: number; keys: AppleKey[] } | undefined;
async function appleKeys(refresh: boolean) {
  if (!refresh && cached && Date.now() - cached.at < 3600_000)
    return cached.keys;
  const r = await fetch(issuer + "/auth/keys", {
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok)
    throw new AppError(502, "Apple's signing keys could not be loaded.");
  const { keys } = (await r.json()) as { keys: AppleKey[] };
  cached = { at: Date.now(), keys };
  return keys;
}
export async function verifyAppleToken(token: string) {
  const fail = () => new AppError(401, "Apple could not verify this account.");
  const parts = token.split(".");
  if (parts.length !== 3) throw fail();
  let header: Record<string, unknown>, payload: Record<string, unknown>;
  try {
    header = decode(parts[0]);
    payload = decode(parts[1]);
  } catch {
    throw fail();
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw fail();
  // Apple rotates its keys, so reload once before rejecting an unknown key ID.
  const jwk =
    (await appleKeys(false)).find((k) => k.kid === header.kid) ||
    (await appleKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) throw fail();
  const signed = verify(
    "sha256",
    Buffer.from(parts[0] + "." + parts[1]),
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(parts[2], "base64url"),
  );
  if (
    !signed ||
    payload.iss !== issuer ||
    payload.aud !== requireConfig("APPLE_SERVICES_ID") ||
    typeof payload.exp !== "number" ||
    payload.exp * 1000 < Date.now() ||
    typeof payload.sub !== "string" ||
    !payload.sub
  )
    throw fail();
  return {
    sub: payload.sub,
    nonce: typeof payload.nonce === "string" ? payload.nonce : "",
  };
}
export async function appleIdentity(code: string, redirectUri: string) {
  const r = await fetch(issuer + "/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireConfig("APPLE_SERVICES_ID"),
      client_secret: appleClientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await r.json().catch(() => ({}))) as { id_token?: string };
  if (!r.ok || !data.id_token)
    throw new AppError(401, "Apple did not return an identity token.");
  return verifyAppleToken(data.id_token);
}
