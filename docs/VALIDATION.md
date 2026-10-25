# Validation of the live-commerce revision

Checked October 24, 2026, using Node 22.22.2. This is evidence of the checks below, not certification of an unconfigured deployment.

## High-effort scan pricing (October 25, 2026, Node 22.22.0)

- Both Claude calls in a scan (identification and the market re-pricing turn) now run at `high` effort instead of `medium`, for more deliberate pricing at the cost of latency and output tokens. Each call may take up to 90 s (was 45 s), and the mobile scan timeout is 240 s (was 180 s).
- 89 automated tests, now asserting the effort on both calls. Root and native typecheck.
- Not run: a live scan to measure the added latency or token cost.

## Market-checked scan prices (October 25, 2026, Node 22.22.0)

- Scans now research prices automatically. Claude writes an eBay search query for each identifiable item. Apify searches for up to 6 of them per scan, highest estimated value first. A second Claude turn, continuing the same conversation with the photo, decides which listings match and re-prices those items. The manual Compare market prices button is gone from both clients; `/compare` stays for older app builds.
- 89 automated tests after merging main. New coverage: only identifiable items are searched; the follow-up turn replays Claude's first answer unchanged and labels listing titles as untrusted; only listings Claude matched are kept, with a median computed from them; a failed Apify run or follow-up keeps Claude's estimate and shows no market check; a search with no listings is reported without a second Claude call; no Apify credentials means no lookups; long listing titles are trimmed to the contract limit.
- Root typecheck and production build. Native typecheck and Expo export for iOS, Android, and web.
- Headless Chromium against the production build with a scratch database, a throwaway seller login, and a placeholder Square location ID. Injected drafts with matched and unmatched market evidence: the web studio shows the market check and source links under Why this price? at 1280 px and 390 px, with no horizontal overflow and no JS exceptions.
- Not run for this revision: a live Claude + Apify scan (no credentials in this environment), the Expo app's new market-check rows on a device or in the web export, and scan latency on a real connection. The mobile scan timeout is now 180 s to allow for the lookups and second Claude pass.

## Saved-product editing (October 24, 2026, Node 22.22.2)

- All 85 tests in 9 files pass. Seven new tests cover owner-only edits, validation, Square object/version preservation, immutable checkout prices, reservation limits, concurrent payment completion, durable retries, stale edits, sold-out status, and restocking.
- Root and native TypeScript checks pass. The optimized Next.js build and Expo exports for iOS, Android, and web pass.
- Headless Chrome at 390×844 exercises both the web dashboard and Expo web editor: cancel discards changes, reopening restores saved values, all six editable fields reach the save request, and a successful save immediately updates the collection. No JavaScript exceptions or horizontal overflow. Editor screenshots were visually inspected.
- UI checks use an isolated temporary database/login and intercept edit responses; the real API handler and SQLite persistence are covered separately with Square mocked at the provider boundary. Run `scripts/product-edit-smoke.mjs` with `SMOKE_URL`, `NATIVE_SMOKE_URL`, `SMOKE_STORE_ID`, `SMOKE_EMAIL`, and `SMOKE_PASSWORD` pointing to an isolated test environment.
- No live catalog mutations, production deployment, signed native build, or physical-device check was performed for this change. Existing deployments create the `item_edits` table automatically at startup.

## Merge with Google sign-in and seller Square accounts (October 25, 2026, Node 22.22.0)

- Storefronts are now owned per account: each Google seller (by subject and environment) or the password seller (per Square environment and location). Before this merge, any valid session could manage every storefront; with public Google signup that would have crossed sellers.
- 76 automated tests. New coverage: Google sellers list, create, rename, and delete only their own storefronts, and neither another Google seller nor the password seller can rename or delete them; a Google seller's new storefront keeps their business details but starts without a Square connection; deleting a Google storefront uses that seller's own Square token, removes its saved Square connection, keeps the seller signed in, and promotes the next storefront (or opens a new one) for future Google sign-ins. Main's OAuth and payment-routing tests pass unchanged apart from clearing the new tables between tests.
- Root typecheck, production build, native typecheck, and Expo export for iOS, Android, and web, after restoring the mobile dependencies that main's lockfile lists but its `package.json` dropped. `npm run smoke` against the production build.
- Not run for this revision: real Google/Square OAuth, real Square catalog deletion, a deployed Convex `inventory:remove`, and physical devices.

## Storefront deletion revision (October 25, 2026, Node 22.22.0)

- 56 automated tests. New coverage: an anonymous delete or a mistyped name is rejected without calling Square; a delete removes the storefront's items, orders, photos, activity, publications, and outbox rows, deletes its Square catalog items with one batch-delete call, queues its Convex removal, and leaves other storefronts untouched; afterward the public page, photos, receipts, and checkout return 404. Deletion is refused while a buyer's checkout is open. If Square fails, the storefront stays closed to checkouts and publishing and a retry finishes the deletion. A publication whose result was uncertain is replayed with its original idempotency key so the Square items it created are deleted too. Deleting the primary storefront promotes the next one, including for existing sessions. Deleting the only storefront opens a new empty one.
- Root typecheck and optimized Next.js production build. Native typecheck and Expo SDK 58 export for iOS, Android, and web. `npm run smoke` against the production build.
- Headless Chromium against the production build with a scratch database, a throwaway seller login, and no external service credentials. In the web studio at 1280 px and 390 px: open a second storefront, confirm a mistyped name keeps the delete button disabled, delete it, return to the remaining storefront (also after reload), and check for horizontal overflow. Delete the only storefront and confirm a new empty one opens and the old storefront's API returns 404. In the Expo web export at 390×844 and 360×640: open a storefront, delete it from the Connections tab, return to the remaining storefront, restore it after reload. No JS exceptions. Screenshots visually inspected.
- Not run for this revision: real Square catalog deletion, a deployed Convex `inventory:remove`, and physical iOS/Android devices.

## Multiple storefronts revision (October 25, 2026, Node 22.22.0)

- 50 automated tests. New coverage: one seller session opens, lists, renames, and scans for several storefronts; anonymous listing/creation is rejected; idempotent creation per request key and the 20-storefront cap; inventory, checkout, and stats isolation between storefronts; the paid scan limit applies to the seller, not each storefront; storefronts are scoped to the configured Square location; a database from the single-store schema upgrades in place without signing the seller out.
- Root typecheck and optimized Next.js production build. Native typecheck and Expo SDK 58 export for iOS, Android, and web.
- `npm run smoke` against the production build.
- Headless Chromium (Playwright's bundled browser) against the production build with a scratch database, a throwaway seller login, and no external service credentials. In the web studio at 1280 px and 390 px: sign in, open a second storefront, switch both ways, keep a saved draft with its own storefront only, remember the open storefront across reloads, check for horizontal overflow, load the new storefront's public page. In the Expo web export at 390×844 and 360×640: open a storefront from the top-bar sheet, switch, restore the open storefront after reload, rename only the open storefront, sign out. No JS exceptions. Screenshots visually inspected.
- Not run for this revision: the repository's `browser-smoke`/`native-smoke` scripts (they target installed Chrome and an isolated account), Square/Claude/Apify/Cartesia/Convex calls, and physical iOS/Android devices. The outstanding release checks below still apply.

## Passed (October 24, 2026)

- 51 automated tests: transactional stock limits, durable reservations, idempotent publication, uncertain-publish conflicts, exact payment totals, sold out, ownership/photo isolation, malformed input, real login/logout/password rotation, login throttling, retired endpoint removal, environment isolation, fail-closed configuration, Square request construction, network timeouts, forged/duplicate webhooks, webhook-before-link races, payment reconciliation, verified cancellation, hold expiry, and Square tax totals.
- Browser UUID regression tests with `crypto.randomUUID` absent, secure-byte fallback, server fallback, and repeated checkout retaining the same key.
- Root and native TypeScript checks; optimized Next.js production build.
- Expo SDK 58 exports for iOS, Android, and web. This verifies JS/native bundles, not a signed application installation.
- Headless Chrome at 390×844: seller login, dashboard, logout; cart checkout with randomUUID deliberately unavailable, stable retry key, no JS exceptions or horizontal overflow. UI checkout responses were intercepted in the test; Square behavior is separately exercised by API tests with provider mocks.
- Expo web rendering at 390×844: login, home, connections, logout; no sample controls, JS errors, or horizontal overflow. Screenshots visually inspected.
- Production `npm start` wrapper launched the isolated build successfully. HTTP smoke checks passed without making external service mutations.
- Docker Compose production configuration parses. Docker image execution was not tested because the local Docker daemon was not running.
- Server dependency audit: zero reported vulnerabilities after updating Sharp, Zod, PostCSS, and Vitest. Package lockfiles record the checked versions.

Fixtures exist only in tests. No fixture seeding script, sample endpoint, simulated completion endpoint, or fabricated API fallback is used by the shipping app. The isolated browser database and test credentials were not copied into the user's project.

## Photo upload fix, October 24, 2026

- Reproduced the TestFlight upload failure using Expo 58's actual FormData patch and multipart encoder: the legacy `{ uri, name, type }` part throws `Unsupported FormDataPart implementation` before the network request starts.
- Native uploads now use `File` from `expo-file-system` with explicit `expo/fetch`. Regression tests verify native file bytes, filename, MIME type, browser Blobs, local size limits, authentication errors, and distinct preparation/network/timeout errors.
- Railway `/api/health` and `/api/ready` returned 200. An authenticated upload of the repository's table illustration returned four real Claude results in about 10 seconds; the saved JPEG was retrieved successfully. No catalog items or payments were created, and the verification session was logged out. This verifies image storage now, not persistence through a redeployment or a backup restore.
- EAS production `EXPO_PUBLIC_API_URL` was verified as `https://snapastore-production.up.railway.app`. No Railway environment or volume changes are needed for this client-side fix.
- The complete 51-test suite, root/native TypeScript checks, Next.js production build, and Expo iOS/Android/web exports passed. The signed production iOS build **1.0.0 (3)** completed on EAS: [build details](https://expo.dev/accounts/neelpatel025/projects/snap-a-store/builds/11c37cde-e7c3-4cdb-aaa0-e6a8e97c4b5e). [EAS submission](https://expo.dev/accounts/neelpatel025/projects/snap-a-store/submissions/aad6178d-ac90-4886-9c7d-396352e56f48) also finished successfully. Apple processing and availability to testers are separate; TestFlight users must install this replacement. The existing installed binary cannot receive local code edits.

## Outstanding release checks

- Square catalog writes/real card checkout/webhook delivery, Apify actor runs, Cartesia audio, and Convex production synchronization still need end-to-end validation against the user's accounts. The live Claude scan and image-storage checks are documented above. `npm run check:services` provides read-only account checks, followed by the launch walkthrough in SERVICE-SETUP.md.
- The public Railway HTTPS deployment passes health/readiness and seller login checks. Verify external Square webhook delivery, the background worker, and database persistence across a deployment.
- The replacement signed iOS build has completed, but the corrected upload still needs verification on a physical device after installing it from TestFlight. Also verify lifecycle/session persistence, deep linking to the buyer storefront, font rendering, and purchases on actual devices. Android physical-device validation remains outstanding.
- Validate the business's pickup/return terms and configured sales-tax percentage. This version supports one merchant/location, USD, uniform configured tax, and local pickup only. Refunds/disputes are handled in Square and do not automatically relist inventory; stock sold outside this app is not synchronized.
- Configure monitoring, off-host backups, and an isolated restore exercise for the persistent database. Never run a restored duplicate against live stock.

## Expo tooling advisory still open

`node-forge@1.4.0`, pulled in by Expo CLI's code-signing tools, remains affected by [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). The upstream advisory lists no patched version at the time of this check. The mobile audit reports four high-severity package entries from that one dependency chain. Zod's mobile tooling advisory was resolved with a pinned override and the CLI/export was tested afterward.

The node-forge package is not used by the storefront backend or imported by application code, but that does not constitute a full exploitability review of Expo's build/signing pipeline. Do not interpret a successful export as resolution of this advisory. Track an upstream Expo/node-forge fix and repeat the tooling audit before release; do not use `npm audit fix --force` to downgrade Expo to an unrelated obsolete SDK.
