import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
if (!process.env.SMOKE_EMAIL || !process.env.SMOKE_PASSWORD)
  throw new Error(
    "Provide an isolated test account in SMOKE_EMAIL/SMOKE_PASSWORD.",
  );
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("artifacts", { recursive: true });
  await page.goto(process.env.NATIVE_SMOKE_URL || "http://localhost:8086");
  await page.getByLabel("Email", { exact: true }).fill(process.env.SMOKE_EMAIL);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SMOKE_PASSWORD);
  await page.screenshot({ path: "artifacts/native-login.png", fullPage: true });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByText("Hello, shopkeeper.", { exact: true }).waitFor();
  await page.screenshot({
    path: "artifacts/native-home-live.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Connections" }).click();
  await page.getByText("Your store’s superpowers", { exact: true }).waitFor();
  await page.screenshot({
    path: "artifacts/native-connections-live.png",
    fullPage: true,
  });
  assert.equal(
    await page.getByText(/sample table|demo revenue|demo mode/i).count(),
    0,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByText("Sign out", { exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Expo web sign-in, home, connections, sign-out; no retired UI or horizontal overflow. Physical-device validation remains separate.",
  );
} catch (e) {
  console.error(e);
  throw e;
} finally {
  await browser.close();
}
