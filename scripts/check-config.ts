import { loadEnvConfig } from "@next/env";
import {
  requireDeploymentConfig,
  publicBase,
  paymentEnvironment,
} from "../lib/server/config";
import { requireConfig } from "../lib/server/errors";
loadEnvConfig(process.cwd(), true);
try {
  requireDeploymentConfig();
  const base = publicBase();
  for (const key of ["ANTHROPIC_API_KEY", "MAINTENANCE_SECRET"])
    requireConfig(key);
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    process.env.SELLER_EMAIL ||
    process.env.SELLER_PASSWORD_HASH
  ) {
    requireConfig("SELLER_EMAIL");
    requireConfig("SELLER_PASSWORD_HASH");
    if (
      !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(
        process.env.SELLER_PASSWORD_HASH!,
      )
    )
      throw new Error(
        "Run npm run setup:seller to configure the password hash.",
      );
  }
  if (process.env.MAINTENANCE_SECRET!.length < 32)
    throw new Error("MAINTENANCE_SECRET must contain at least 32 characters.");
  console.log(
    `Configuration valid: ${paymentEnvironment()} · ${base}. Run npm run check:services to check account access.`,
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : "Invalid configuration");
  process.exitCode = 1;
}
