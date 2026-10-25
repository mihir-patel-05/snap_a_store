# Snap-a-Store

An Expo seller app for iOS and Android, with a public storefront and Square checkout. Photograph your items, review Claude's proposed names and prices, publish your catalog, and share a storefront QR code. Inventory is reserved before checkout and sold only after a verified Square payment.

**No sample catalog, simulated payment endpoint, or fallback recognition exists in the app.** Missing service credentials produce an explicit setup error. Existing sample stores are retired; a new database (`data/snap-live.sqlite`) keeps earlier data separate without deleting it.

## Start here

For Railway hosting, follow **[Deploy the backend and web frontend to Railway](docs/RAILWAY-DEPLOYMENT.md)**. The customer storefront and backend share one HTTPS address; the Expo native app connects to it.

For public seller signup, follow **[Google sign-in and seller Square connections](docs/GOOGLE-SIGNIN.md)**. It covers the five new backend variables, both OAuth callback URLs, and rebuilding the native app. Every Google seller gets an isolated store and connects their own Square account.

Follow **[Service setup and deployment](docs/SERVICE-SETUP.md)** for the shared Anthropic key, HTTPS backend, optional Apify/Cartesia/Convex services, and existing password store.

```bash
nvm use 22
npm ci
# Copy .env.example to .env.local and configure private service credentials.
npm run setup:seller       # optional legacy password account
npm run check:config
npm run check:services
npm run dev
```

In a second terminal:

```bash
cd mobile
nvm use 22
npm ci
npm start
```

Set `EXPO_PUBLIC_API_URL` to your backend origin. Google sign-in uses an installed native build with the `snapastore` scheme; Expo Go supports the existing password login only. Local HTTP can be used to develop and scan photos; **production checkout requires a public HTTPS backend**. Set both `PUBLIC_BASE_URL` and `EXPO_PUBLIC_API_URL` to that deployed origin before selling. Restart the backend and Expo after changing environment variables.

## Operating scope

This deployment supports **multiple sellers, one Square merchant/location per store, USD prices, and local pickup**. Google sellers connect their own Square accounts; the existing password seller keeps the configured platform account. A seller can sign in on multiple devices. Shipping and app-based refunds are not implemented. Manage refunds/disputes in Square; refunded stock is not automatically relisted. Dedicated inventory sold through this app is authoritative in SQLite; don't sell the same reserved stock through a separate channel. Apify and Cartesia are optional; durable inventory does not require Convex.

Run one backend replica on persistent local storage. The supplied production Compose configuration adds HTTPS through Caddy and a maintenance worker that reconciles payments and cancels expired checkouts only after Square confirms they are unpaid. Do not deploy this SQLite service on an ephemeral/serverless filesystem.

## Security and payment behavior

- Google sign-in verifies signed identity tokens, browser-bound state, and nonces; native callbacks use one-time codes bound to PKCE. Stores are keyed by Google subject, never matched by email.
- Opaque sessions are hashed and expire after 30 days. Web sessions use HttpOnly cookies; native sessions use SecureStore. Legacy passwords use scrypt, and changing the configured password revokes password sessions.
- Square OAuth access/refresh tokens are encrypted with AES-256-GCM. Catalogs, checkout, reconciliation, and webhooks resolve the owning store's merchant/location.
- A checkout key survives retries. The browser supports HTTP environments without `crypto.randomUUID()` using secure random bytes or server-issued UUIDs; it never falls back to `Math.random()`.
- Square catalog publication and payment-link creation use stable idempotency keys. Stock reservations survive process restarts and uncertain network failures.
- A signed webhook or authenticated Square payment lookup verifies order, location, currency, amount, and completion. Browser redirects cannot mark orders paid.
- Payment links are single use. After 30 minutes, the worker attempts cancellation; it retains stock whenever Square's result is uncertain. Monitor maintenance failures and reconcile in Square before intervening.
- Taxes are explicitly configured for this local-pickup store and calculated by Square. Buyer card data stays on Square. Pickup/return/contact policies appear on the storefront.
- The public Convex snapshot excludes seller earnings, activity, sessions, and credentials.

## Verification

```bash
npm test
npm run typecheck
npm run build
npm run smoke              # backend on localhost:3000
cd mobile
npm run typecheck
npm run export
```

See [validation evidence and remaining release checks](docs/VALIDATION.md). Automated tests use fixtures only inside `tests/`; external services are mocked at the test boundary. Passing tests is not proof that your actual payment account, webhook, device permissions, or deployment is correctly configured.
