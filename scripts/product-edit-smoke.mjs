import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.SMOKE_URL || "http://127.0.0.1:43110";
const mobile = process.env.NATIVE_SMOKE_URL || "http://127.0.0.1:43111";
const storeId = process.env.SMOKE_STORE_ID;
if (!storeId || !process.env.SMOKE_EMAIL || !process.env.SMOKE_PASSWORD)
  throw new Error("Use an isolated smoke-test store and credentials.");
const original = await (await fetch(`${base}/api/stores/${storeId}`)).json();
assert.ok(original.items.length);
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
let activePage;
try {
  for (const native of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let snapshot = structuredClone(original),
      saves = 0;
    const initial = snapshot.items[0];
    // This is a UI contract test. The real handler, database and Square request
    // behavior are tested separately by tests/item-edit.test.ts.
    await page.route(`**/api/stores/${storeId}`, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({ json: snapshot });
    });
    await page.route("**/api/stores/*/items/*", async (route) => {
      assert.equal(route.request().method(), "PATCH");
      const changes = route.request().postDataJSON();
      assert.match(changes.requestKey, /^[a-f0-9-]{36}$/);
      assert.equal(changes.expectedVersion, 0);
      assert.equal(changes.name, "Updated saved product");
      assert.equal(changes.price, 18.75);
      assert.equal(changes.remaining, 4);
      assert.equal(changes.description, "Updated product description.");
      assert.equal(changes.condition, "Fair");
      assert.equal(changes.category, "Other");
      saves++;
      const { requestKey, expectedVersion, ...fields } = changes;
      snapshot = {
        ...snapshot,
        store: { ...snapshot.store, revision: snapshot.store.revision + 1 },
        items: snapshot.items.map((i) =>
          i.id === initial.id
            ? { ...i, ...fields, available: fields.remaining, editVersion: 1 }
            : i,
        ),
      };
      await route.fulfill({ json: snapshot });
    });
    await page.goto(native ? mobile : base + "/studio");
    await page
      .getByLabel("Email", { exact: true })
      .fill(process.env.SMOKE_EMAIL);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env.SMOKE_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const edit = () =>
      page.getByRole("button", { name: `Edit ${initial.name}`, exact: true });
    await edit().click();
    await page
      .getByLabel("Product name", { exact: true })
      .fill("Unsaved change");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(saves, 0);
    await edit().click();
    assert.equal(
      await page.getByLabel("Product name", { exact: true }).inputValue(),
      initial.name,
    );
    await page
      .getByLabel("Product name", { exact: true })
      .fill("Updated saved product");
    await page
      .getByRole("textbox", { name: "Description", exact: true })
      .fill("Updated product description.");
    await page
      .getByLabel(native ? "Price" : "Price ($)", { exact: true })
      .fill("18.75");
    await page.getByLabel("Unsold stock", { exact: true }).fill("4");
    if (native) {
      await page.getByRole("button", { name: "Fair", exact: true }).click();
      await page.getByRole("button", { name: "Other", exact: true }).click();
    } else {
      await page
        .getByRole("combobox", { name: "Condition", exact: true })
        .selectOption("Fair");
      await page
        .getByRole("combobox", { name: "Category", exact: true })
        .selectOption("Other");
    }
    await page.screenshot({
      path: `artifacts/${native ? "native" : "web"}-product-editor.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit Updated saved product", exact: true })
      .waitFor();
    assert.equal(saves, 1);
    assert.deepEqual(errors, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await context.close();
    console.log(
      `PASS: ${native ? "Expo web" : "web dashboard"} saved-product edit, cancel, all fields, save payload, and updated collection.`,
    );
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({
      path: "artifacts/product-edit-failure.png",
      fullPage: true,
    });
    console.error(await activePage.locator("body").ariaSnapshot());
  }
  throw error;
} finally {
  await browser.close();
}
