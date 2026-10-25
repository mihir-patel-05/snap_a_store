import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AppError, requireConfig } from "./errors";
const derive = promisify(scrypt);
export function credentialVersion() {
  return createHash("sha256")
    .update(`${process.env.SELLER_EMAIL}:${process.env.SELLER_PASSWORD_HASH}`)
    .digest("hex");
}
// Seller sign-up accounts use the same scrypt format as the legacy seller hash.
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${digest.toString("hex")}`;
}
// A fixed hash to compare against when no account matches, so a missing email
// takes as long as a wrong password.
const absent = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;
export async function verifyPassword(password: string, encoded = absent) {
  const [, salt, digest] = encoded.split(":");
  const actual = (await derive(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(digest, "hex")) && encoded !== absent;
}
export function isLegacySeller(email: string) {
  return (
    Boolean(process.env.SELLER_EMAIL && process.env.SELLER_PASSWORD_HASH) &&
    email.toLowerCase() === process.env.SELLER_EMAIL!.toLowerCase()
  );
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
