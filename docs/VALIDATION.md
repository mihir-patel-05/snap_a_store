# Validation of the live-commerce revision

Checked October 24, 2026, using Node 22.22.2. This is evidence of the checks below, not certification of an unconfigured deployment.

## Passed

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
