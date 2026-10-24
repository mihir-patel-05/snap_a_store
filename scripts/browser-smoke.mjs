import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.SMOKE_URL || "http://localhost:3110";
if (
  !process.env.SMOKE_EMAIL ||
  !process.env.SMOKE_PASSWORD ||
  !process.env.SMOKE_STORE_ID
)
  throw new Error(
    "Provide SMOKE_EMAIL and SMOKE_PASSWORD for an isolated test account.",
  );
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("artifacts", { recursive: true });
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto(base + "/studio");
  await page.getByLabel("Email", { exact: true }).fill(process.env.SMOKE_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SMOKE_PASSWORD);
  await page.screenshot({ path: "artifacts/seller-login.png", fullPage: true });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Add a photo", exact: true })
    .waitFor();
  assert.equal(
    await page.getByText(/try the sample|demo checkout/i).count(),
    0,
  );
  await page.screenshot({
    path: "artifacts/seller-dashboard.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  if (process.env.SMOKE_STORE_ID) {
    await page.goto(`${base}/s/${process.env.SMOKE_STORE_ID}`);
    await page
      .getByRole("button", { name: "Add to bag", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: /in your bag/ }).click();
    let requestKey;
    await page.route("**/api/checkout", async (route) => {
      requestKey = route.request().postDataJSON().requestKey;
      // UI-only fixture: backend Square behavior is exercised separately in API tests.
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "Connect your deployed HTTPS server before accepting payments.",
        }),
      });
    });
    await page
      .getByRole("button", { name: "Continue to Square", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retry this checkout", exact: true })
      .waitFor();
    const first = requestKey;
    await page
      .getByRole("button", { name: "Retry this checkout", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retry this checkout", exact: true })
      .waitFor();
    assert.match(
      first,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    assert.equal(first, requestKey);
    assert.equal(
      await page.getByText("crypto.randomUUID is not a function").count(),
      0,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "artifacts/checkout-http-regression.png",
      fullPage: true,
    });
  }
  await page.goto(base + "/studio");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: seller sign-in/dashboard/sign-out, HTTP checkout UUID fallback and retry key stability, phone width without overflow. No real payments made.",
  );
} finally {
  await browser.close();
}
