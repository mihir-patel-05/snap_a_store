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

export function business() {
  return {
    name: process.env.BUSINESS_NAME || "Snap-a-Store",
    email: process.env.SUPPORT_EMAIL || "",
    pickup: process.env.PICKUP_INSTRUCTIONS || "",
    returns: process.env.RETURN_POLICY || "",
    taxPercent: process.env.SALES_TAX_PERCENT || "",
  };
}

export function requirePayments() {
  for (const key of [
    "SQUARE_ACCESS_TOKEN",
    "SQUARE_LOCATION_ID",
    "SQUARE_WEBHOOK_SIGNATURE_KEY",
  ])
    requireConfig(key);
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
    for (const key of [
      "BUSINESS_NAME",
      "SUPPORT_EMAIL",
      "PICKUP_INSTRUCTIONS",
      "RETURN_POLICY",
      "SALES_TAX_PERCENT",
    ])
      requireConfig(key);
  }
  const tax = process.env.SALES_TAX_PERCENT;
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
    store.locationId !== process.env.SQUARE_LOCATION_ID
  )
    throw new AppError(
      410,
      "This store belongs to an earlier environment. Sign in to open the current store.",
    );
}
