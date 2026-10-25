# Validation of the live-commerce revision

Checked October 24, 2026, using Node 22.22.2. This is evidence of the checks below, not certification of an unconfigured deployment.

## Passed

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
