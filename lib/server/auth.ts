import { createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AppError, requireConfig } from "./errors";
const derive = promisify(scrypt);
export function credentialVersion() {
  return createHash("sha256")
    .update(`${process.env.SELLER_EMAIL}:${process.env.SELLER_PASSWORD_HASH}`)
    .digest("hex");
}
export async function verifyLogin(email: string, password: string) {
  const expectedEmail = requireConfig("SELLER_EMAIL").toLowerCase();
  const encoded = requireConfig("SELLER_PASSWORD_HASH");
  const [scheme, salt, digest] = encoded.split(":");
  if (
    scheme !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(salt || "") ||
    !/^[a-f0-9]{128}$/.test(digest || "")
  )
    throw new AppError(
      503,
      "Seller credentials are not configured. Run npm run setup:seller on the server.",
    );
  const actual = (await derive(password, salt, 64)) as Buffer;
  if (
    !timingSafeEqual(actual, Buffer.from(digest, "hex")) ||
    email.toLowerCase() !== expectedEmail
  )
    throw new AppError(401, "Email or password is incorrect.");
}
