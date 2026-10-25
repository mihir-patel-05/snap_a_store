import { AppError, requireConfig } from "./errors";
import type { Store } from "../contracts";

export function paymentEnvironment(): "production" | "sandbox" {
  const value = process.env.SQUARE_ENVIRONMENT || "production";
  if (value !== "production" && value !== "sandbox")
    throw new AppError(
      503,
      "SQUARE_ENVIRONMENT must be production or sandbox.",
    );
  return value;
}

export function publicBase() {
  const value = requireConfig("PUBLIC_BASE_URL").replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(503, "Set a valid PUBLIC_BASE_URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new AppError(
      503,
      "PUBLIC_BASE_URL must contain only the web origin.",
    );
  return url.origin;
}

export function business(store?: Store) {
  if (store?.paymentProvider === "square_oauth")
    return {
      name: store.name,
      email: store.business?.email || "",
      pickup: store.business?.pickup || "",
      returns: store.business?.returns || "",
      taxPercent: store.business?.taxPercent || "",
    };
  return {
    name: process.env.BUSINESS_NAME || "Snap-a-Store",
    email: process.env.SUPPORT_EMAIL || "",
    pickup: process.env.PICKUP_INSTRUCTIONS || "",
    returns: process.env.RETURN_POLICY || "",
    taxPercent: process.env.SALES_TAX_PERCENT || "",
  };
}

export function requirePayments(store?: Store) {
  requireConfig("SQUARE_WEBHOOK_SIGNATURE_KEY");
  if (store?.paymentProvider === "square_oauth") {
    if (!store.locationId || !store.merchantId)
      throw new AppError(
        409,
        "Connect your Square account and choose a location before publishing.",
      );
    for (const key of [
      "SQUARE_APPLICATION_ID",
      "SQUARE_APPLICATION_SECRET",
      "OAUTH_ENCRYPTION_KEY",
    ])
      requireConfig(key);
  } else {
    requireConfig("SQUARE_ACCESS_TOKEN");
    requireConfig("SQUARE_LOCATION_ID");
  }
  const base = publicBase();
  if (paymentEnvironment() === "production") {
    const host = new URL(base).hostname;
    if (
      !base.startsWith("https://") ||
      host === "localhost" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host)
    )
      throw new AppError(
        503,
        "Real checkout requires a public HTTPS domain. Configure PUBLIC_BASE_URL after deploying.",
      );
    if (store?.paymentProvider === "square_oauth") {
      const details = business(store);
      if (
        !details.email ||
        !details.pickup ||
        !details.returns ||
        !details.taxPercent
      )
        throw new AppError(
          409,
          "Save your contact email, pickup instructions, return policy, and tax rate before publishing.",
        );
    } else {
      for (const key of [
        "BUSINESS_NAME",
        "SUPPORT_EMAIL",
        "PICKUP_INSTRUCTIONS",
        "RETURN_POLICY",
        "SALES_TAX_PERCENT",
      ])
        requireConfig(key);
    }
  }
  const tax =
    store?.paymentProvider === "square_oauth"
      ? store.business?.taxPercent
      : process.env.SALES_TAX_PERCENT;
  if (
    tax !== undefined &&
    tax !== "" &&
    (!/^\d{1,2}(\.\d{1,4})?$/.test(tax) || Number(tax) > 30)
  )
    throw new AppError(
      503,
      "SALES_TAX_PERCENT must be a percentage between 0 and 30.",
    );
  return base;
}

export function assertStoreEnvironment(store: Store) {
  if (
    store.paymentMode !== paymentEnvironment() ||
    (store.paymentProvider !== "square_oauth" &&
      store.locationId !== process.env.SQUARE_LOCATION_ID)
  )
    throw new AppError(
      410,
      "This store belongs to an earlier environment. Sign in to open the current store.",
    );
}

export function requireDeploymentConfig() {
  const google = Boolean(
    process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_SECRET,
  );
  if (!google) {
    requirePayments();
    return;
  }
  for (const key of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "SQUARE_APPLICATION_ID",
    "SQUARE_APPLICATION_SECRET",
    "SQUARE_WEBHOOK_SIGNATURE_KEY",
    "OAUTH_ENCRYPTION_KEY",
  ])
    requireConfig(key);
  if (!/^[a-f0-9]{64}$/i.test(process.env.OAUTH_ENCRYPTION_KEY || ""))
    throw new AppError(
      503,
      "OAUTH_ENCRYPTION_KEY must be 64 hexadecimal characters.",
    );
  const base = publicBase();
  if (
    paymentEnvironment() === "production" &&
    (!base.startsWith("https:") || new URL(base).hostname === "localhost")
  )
    throw new AppError(503, "Public signup requires a deployed HTTPS backend.");
}
