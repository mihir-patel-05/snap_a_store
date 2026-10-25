# Validation of the live-commerce revision

Checked October 24, 2026, using Node 22.22.2. This is evidence of the checks below, not certification of an unconfigured deployment.

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

- 40 automated tests: transactional stock limits, durable reservations, idempotent publication, uncertain-publish conflicts, exact payment totals, sold out, ownership/photo isolation, malformed input, real login/logout/password rotation, login throttling, retired endpoint removal, environment isolation, fail-closed configuration, Square request construction, network timeouts, forged/duplicate webhooks, webhook-before-link races, payment reconciliation, verified cancellation, hold expiry, and Square tax totals.
- Browser UUID regression tests with `crypto.randomUUID` absent, secure-byte fallback, server fallback, and repeated checkout retaining the same key.
- Root and native TypeScript checks; optimized Next.js production build.
- Expo SDK 58 exports for iOS, Android, and web. This verifies JS/native bundles, not a signed application installation.
- Headless Chrome at 390×844: seller login, dashboard, logout; cart checkout with randomUUID deliberately unavailable, stable retry key, no JS exceptions or horizontal overflow. UI checkout responses were intercepted in the test; Square behavior is separately exercised by API tests with provider mocks.
- Expo web rendering at 390×844: login, home, connections, logout; no sample controls, JS errors, or horizontal overflow. Screenshots visually inspected.
- Production `npm start` wrapper launched the isolated build successfully. HTTP smoke checks passed without making external service mutations.
- Docker Compose production configuration parses. Docker image execution was not tested because the local Docker daemon was not running.
- Server dependency audit: zero reported vulnerabilities after updating Sharp, Zod, PostCSS, and Vitest. Package lockfiles record the checked versions.

Fixtures exist only in tests. No fixture seeding script, sample endpoint, simulated completion endpoint, or fabricated API fallback is used by the shipping app. The isolated browser database and test credentials were not copied into the user's project.

## Outstanding release checks

- No private service credentials were supplied. Claude image recognition, Square catalog writes/real card checkout/webhook delivery, Apify actor runs, Cartesia audio, and Convex production synchronization have not been validated against the user's accounts. `npm run check:services` provides read-only account checks after configuration, followed by the launch walkthrough in SERVICE-SETUP.md.
- No public HTTPS domain has been deployed. Live checkout intentionally refuses the current HTTP LAN URL. Verify external webhook delivery and the background worker after deployment.
- No physical iOS/Android installation or signing was performed. Verify photo permissions, lifecycle/session persistence, deep linking to the buyer storefront, font rendering, and purchases on actual devices. Set real bundle identifiers/EAS project credentials before distribution.
- Validate the business's pickup/return terms and configured sales-tax percentage. This version supports one merchant/location, USD, uniform configured tax, and local pickup only. Refunds/disputes are handled in Square and do not automatically relist inventory; stock sold outside this app is not synchronized.
- Configure monitoring, off-host backups, and an isolated restore exercise for the persistent database. Never run a restored duplicate against live stock.

## Expo tooling advisory still open

`node-forge@1.4.0`, pulled in by Expo CLI's code-signing tools, remains affected by [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv). The upstream advisory lists no patched version at the time of this check. The mobile audit reports four high-severity package entries from that one dependency chain. Zod's mobile tooling advisory was resolved with a pinned override and the CLI/export was tested afterward.

The node-forge package is not used by the storefront backend or imported by application code, but that does not constitute a full exploitability review of Expo's build/signing pipeline. Do not interpret a successful export as resolution of this advisory. Track an upstream Expo/node-forge fix and repeat the tooling audit before release; do not use `npm audit fix --force` to downgrade Expo to an unrelated obsolete SDK.
