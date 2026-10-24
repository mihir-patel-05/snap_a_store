import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { scryptSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
if (!process.stdin.isTTY) {
  console.error("Run npm run setup:seller in an interactive terminal.");
  process.exit(1);
}
let hidden = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
const ask = (label, secret = false) =>
  new Promise((resolve) => {
    process.stdout.write(label);
    hidden = secret;
    rl.question("", (answer) => {
      hidden = false;
      if (secret) process.stdout.write("\n");
      resolve(answer);
    });
  });
try {
  const email = String(await ask("Seller email: "))
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address.");
  const password = String(
    await ask("Seller password (at least 14 characters, hidden): ", true),
  );
  if (password.length < 14 || password.length > 512)
    throw new Error("Use a password with 14–512 characters.");
  if (password !== String(await ask("Confirm password (hidden): ", true)))
    throw new Error("Passwords do not match.");
  const salt = randomBytes(16).toString("hex"),
    hash = `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  const path = ".env.local";
  let content = readFileSync(existsSync(path) ? path : ".env.example", "utf8");
  function set(key, value) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    content = pattern.test(content)
      ? content.replace(pattern, `${key}=${value}`)
      : content.trimEnd() + `\n${key}=${value}\n`;
  }
  set("SELLER_EMAIL", email);
  set("SELLER_PASSWORD_HASH", hash);
  if (!/^MAINTENANCE_SECRET=.+$/m.test(content))
    set("MAINTENANCE_SECRET", randomBytes(32).toString("hex"));
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
  console.log(
    "Seller credentials saved to .env.local. Restart the backend. Existing seller sessions are revoked by password changes.",
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : "Setup failed.");
  process.exitCode = 1;
} finally {
  rl.close();
}
