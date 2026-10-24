import { loadEnvConfig } from "@next/env";
import { requirePayments, paymentEnvironment } from "../lib/server/config";
import { requireConfig } from "../lib/server/errors";
loadEnvConfig(process.cwd(), true);
try {
  const base = requirePayments();
  for (const key of [
    "ANTHROPIC_API_KEY",
    "SELLER_EMAIL",
    "SELLER_PASSWORD_HASH",
    "MAINTENANCE_SECRET",
  ])
    requireConfig(key);
  if (
    !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(
      process.env.SELLER_PASSWORD_HASH!,
    )
  )
    throw new Error("Run npm run setup:seller to configure the password hash.");
  if (process.env.MAINTENANCE_SECRET!.length < 32)
    throw new Error("MAINTENANCE_SECRET must contain at least 32 characters.");
  console.log(
    `Configuration valid: ${paymentEnvironment()} · ${base}. Run npm run check:services to check account access.`,
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : "Invalid configuration");
  process.exitCode = 1;
}
