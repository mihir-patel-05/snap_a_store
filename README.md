# Snap-a-Store

An Expo seller app for iOS and Android, with a public storefront and Square checkout. Photograph your items, review Claude's proposed names and prices, publish your catalog, and share a storefront QR code. Inventory is reserved before checkout and sold only after a verified Square payment.

**No sample catalog, simulated payment endpoint, or fallback recognition exists in the app.** Missing service credentials produce an explicit setup error. Existing sample stores are retired; a new database (`data/snap-live.sqlite`) keeps earlier data separate without deleting it.

## Start here

For Railway hosting, follow **[Deploy the backend and web frontend to Railway](docs/RAILWAY-DEPLOYMENT.md)**. The customer storefront and backend share one HTTPS address; the Expo native app connects to it.

Follow **[Service setup and deployment](docs/SERVICE-SETUP.md)**. You need your own Anthropic and Square accounts, a public HTTPS backend for live checkout, and a seller login. Optional Apify, Cartesia, and Convex integrations have complete setup instructions there.

```bash
nvm use 22
npm ci
# .env.local is already present on this Mac. Fill its service credentials.
npm run setup:seller
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

The local mobile API URL is `http://172.20.1.172:3000`. Sign in with the seller email/password you created. Local HTTP can be used to develop and scan photos; **production checkout requires a public HTTPS backend**. Set both `PUBLIC_BASE_URL` and `EXPO_PUBLIC_API_URL` to that deployed origin before selling. Restart the backend and Expo after changing environment variables.

## Operating scope

This deployment serves **one Square merchant, one location, USD prices, and local pickup**. The same seller can sign in on multiple devices.

The seller can run **several storefronts** (up to 20), for example one per sale or collection. Each storefront has its own link, QR code, inventory, and sales stats. All of them share the Square account and location, tax rate, and pickup/return policies. Switch storefronts from the top bar in the app or the storefront row in `/studio`. Delete a storefront from the **Delete this storefront** card in `/studio` or the app's settings tab, after retyping its name. Deleting removes its link and QR code, listings, photos, its items in your Square catalog, its Convex projection, and this app's records of its orders; payments and receipts stay in Square. A storefront with a buyer's checkout still open can't be deleted until that checkout is paid or expires. Deleting your only storefront opens a new empty one named after `BUSINESS_NAME`. Multi-merchant Square OAuth, shipping, and app-based refunds are not implemented. Manage refunds/disputes in Square; refunded stock is not automatically relisted. Dedicated inventory sold through this app is authoritative in SQLite; don't sell the same reserved stock through a separate channel. Apify and Cartesia are optional; durable inventory does not require Convex.

Run one backend replica on persistent local storage. The supplied production Compose configuration adds HTTPS through Caddy and a maintenance worker that reconciles payments and cancels expired checkouts only after Square confirms they are unpaid. Do not deploy this SQLite service on an ephemeral/serverless filesystem.

## Security and payment behavior

- Seller passwords are scrypt hashes; opaque sessions are hashed, expire after 30 days, and are revoked when the configured password changes. Web sessions use HttpOnly cookies; native sessions use SecureStore. No public merchant signup endpoint exists; only the signed-in seller can open more storefronts.
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
