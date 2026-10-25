# Configure and launch Snap-a-Store

The app uses real APIs. There is no sample-store button or simulated checkout. Complete the required services first; add the optional services to enable their features. Keep private keys in the root `.env.local` or your server's secret manager. Only public URLs belong in `mobile/.env.local` or Expo's environment variables.

For public signup and multiple sellers, start with **[Google sign-in and seller Square connections](GOOGLE-SIGNIN.md)**. Each seller authorizes their own Square account and saves their own business settings. The personal access token and password instructions below retain the existing legacy seller account; they are optional in a Google-only deployment. USD and local pickup remain the supported checkout scope. Use separate credentials and databases for Square sandbox; production remains the default.

## 1. Anthropic: photo recognition (required)

1. Create a Claude API account at [Claude Console](https://platform.claude.com/), enable API billing, and create an API key. A Claude chat subscription alone does not configure API access.
2. Put these values in the root `.env.local`:

```dotenv
ANTHROPIC_API_KEY=your_private_api_key
ANTHROPIC_MODEL=claude-sonnet-5-5
```

3. The model must be enabled for your account. `npm run check:services` checks model access without sending a photo. After deployment, photograph an actual table, check object names/quantities, edit the estimates, and confirm no listings appear before you publish.

Uploaded photos are resized and stripped of original metadata before recognition and storage. Published listing photos become public. [Model documentation](https://platform.claude.com/docs/en/models/overview).

## 2. Square: catalog and payments (required)

1. Create/activate your Square seller account for payments. Open the [Developer Dashboard](https://developer.squareup.com/apps), create an application, and select its **Production** credentials.
2. Copy the production access token. The legacy password store uses this account's personal access token on the server; never embed it in the mobile app.
3. Find your active US/USD location in the application's Locations page. Set:

```dotenv
SQUARE_ENVIRONMENT=production
SQUARE_ACCESS_TOKEN=your_production_access_token
SQUARE_LOCATION_ID=your_active_location_id
```

4. For a restricted OAuth token, permissions must cover catalog read/write (`ITEMS_READ`, `ITEMS_WRITE`), merchant/location read (`MERCHANT_PROFILE_READ`), order read/write (`ORDERS_READ`, `ORDERS_WRITE`), and payment read/write (`PAYMENTS_READ`, `PAYMENTS_WRITE`). The [seller OAuth flow](GOOGLE-SIGNIN.md) requests these permissions automatically. A legacy personal token must belong to the intended legacy merchant.
5. After your HTTPS backend is online, add a **Production webhook subscription** to the same application. Notification URL:

```text
https://YOUR_DOMAIN/api/webhooks/square
```

6. Subscribe to `payment.created` and `payment.updated`, using API version `2026-09-16`. Copy the **signature key** into the server environment:

```dotenv
SQUARE_WEBHOOK_SIGNATURE_KEY=your_subscription_signature_key
SQUARE_WEBHOOK_URL=https://YOUR_DOMAIN/api/webhooks/square
```

The signature URL must match the registered URL exactly, including any trailing slash. The default is `PUBLIC_BASE_URL` plus `/api/webhooks/square`. Restart/redeploy after setting it.

7. Run `npm run check:services`. It checks the location's currency, active status, and card-processing capability. Then verify a real item can be published to the correct Square catalog. The app does not charge a card by itself; payment happens only when a buyer submits Square's checkout form.

An API-created link is for one checkout. The reusable storefront QR creates a fresh cart link for each buyer. See [CreatePaymentLink](https://developer.squareup.com/reference/square/checkout/create-payment-link), [single-use link behavior](https://developer.squareup.com/docs/checkout-api/common-pitfalls), and [webhook signature validation](https://developer.squareup.com/docs/webhooks/step3validate).

For prelaunch testing, Square's actual sandbox API is supported with `SQUARE_ENVIRONMENT=sandbox` and its own credentials, subscription, and `DATABASE_PATH=data/snap-sandbox.sqlite`. It is isolated from production and clearly labeled. There is no application-generated fake payment success. Switch back to production and sign in again before launching; never reuse sandbox catalog IDs.

## 3. Legacy business settings and password login (optional with Google)

Fill these with your actual business information:

```dotenv
BUSINESS_NAME=Your store name
SUPPORT_EMAIL=you@yourdomain.com
PICKUP_INSTRUCTIONS=Where and when buyers should collect their purchases
RETURN_POLICY=Your actual return and refund policy
SALES_TAX_PERCENT=your_applicable_percentage
DATABASE_PATH=data/snap-live.sqlite
```

`BUSINESS_NAME` also names the password seller's first storefront. After signing in, any seller can open more storefronts (up to 20) from the storefront switcher in the app or `/studio`. The password seller's storefronts all use these business settings and the same Square location. A Google seller's new storefront copies their saved business details and connects Square separately.

`SALES_TAX_PERCENT` is a number from 0 to 30, up to four decimal places. For example, `8.625` means 8.625%. Set `0` only when appropriate for your sales. The application does not determine tax obligations or automatically choose rates by jurisdiction. It applies this configured rate to all items; businesses with exemptions or multiple tax jurisdictions need more tax logic before using this deployment for those sales.

Create the seller login locally:

```bash
cd /Users/neelpatel/Documents/GitHub/snap_a_store
nvm use 22
npm run setup:seller
```

The terminal prompts for email and a hidden password of at least 14 characters. It writes `SELLER_EMAIL`, a scrypt `SELLER_PASSWORD_HASH`, and a generated `MAINTENANCE_SECRET` into `.env.local` without printing the password. This is the login for both the mobile app and `/studio`.

Public signup uses Google; password recovery for the legacy account is administrator-managed. To recover/change its access, run this command on the trusted server checkout, deploy the new hash, and restart. Changing credentials revokes all previous seller sessions. Do not send private keys or passwords in chat.

## 4. Public HTTPS backend (required for real checkout)

For managed hosting, follow **[Deploy the backend and web frontend to Railway](RAILWAY-DEPLOYMENT.md)**. It uses the existing Dockerfile, a persistent volume, and a maintenance worker. The instructions below describe the alternative of managing your own Docker Compose host.

A phone's LAN IP is useful for local development, but it cannot receive Square webhooks from the internet. Deploy the backend on a Linux host with Docker Compose, a persistent disk, and a domain pointing to that host. The included deployment uses one backend replica, a maintenance worker, and Caddy for HTTPS.

1. Copy/clone the project onto your server. Install Docker Engine and the Compose plugin. Point a domain's DNS record at the server and allow inbound TCP 80/443. Keep the application port 3000 private.
2. Put the completed private `.env.local` on that server with file permissions `600`; never commit it. Set:

```dotenv
PUBLIC_BASE_URL=https://YOUR_DOMAIN
TRUST_PROXY=1
ALLOWED_ORIGINS=https://YOUR_DOMAIN
```

3. From the repository on the server:

```bash
export STORE_DOMAIN=YOUR_DOMAIN
docker compose -f compose.production.yaml up -d --build
```

Replace `YOUR_DOMAIN` with only the hostname, e.g. `store.yourdomain.com`. Caddy obtains and renews TLS certificates. The backend's named `store-data` volume contains SQLite and photos; preserve that volume across deploys. `TRUST_PROXY=1` is safe here because port 3000 is private and Caddy overwrites the forwarding header. Leave it `0` when directly exposing a local development server.

4. Finish the Square webhook subscription from step 2. Recreate the containers after editing secrets:

```bash
docker compose -f compose.production.yaml up -d --force-recreate
```

5. Check [your readiness endpoint](https://YOUR_DOMAIN/api/ready) using your actual hostname. It returns 200 only when required configuration and storage are present; this is not a live-service certification. `/api/health` is a basic liveness check. Monitor both externally.
6. Check worker logs:

```bash
docker compose -f compose.production.yaml logs --tail=50 maintenance
```

The worker runs roughly once a minute. It queries Square for pending payments and attempts to cancel expired 30-minute holds. An uncertain cancellation retains inventory and increments `failed`; investigate recurring failures. Configure your host's logging/monitoring to alert on these messages, unhealthy containers, disk pressure, and HTTP errors.

If you host without Compose, run `npm run build`, `npm start`, and `npm run maintenance -- --watch` as supervised processes behind HTTPS. A scheduler may instead run `npm run maintenance` every minute. The worker authenticates with `MAINTENANCE_SECRET`; keep it private. Do not use Vercel-style ephemeral functions with this SQLite architecture.

## 5. Apify: market-checked prices (optional)

1. Create an [Apify account](https://console.apify.com/), add billing/credits, and obtain an API token under Settings → Integrations.
2. Open [the configured eBay actor](https://apify.com/ninhothedev/ebay-scraper). Authorize its use in your account and check its current pricing.
3. Set:

```dotenv
APIFY_TOKEN=your_private_token
APIFY_ACTOR_ID=ninhothedev~ebay-scraper
```

4. Restart the backend and scan a photo with an identifiable product (a visible brand, model, or book title). Each scan searches eBay for up to 6 such items, one actor run each, so budget Apify credits accordingly. Claude then picks the listings that match the item in the photo and sets the final price from them. Under **Why this price?**, verify the matched eBay links and USD prices. These are active asking prices, not completed sales. Generic items are not searched. Without `APIFY_TOKEN`, or when a run fails, scans keep Claude's own estimate and show no market check. Seller pricing remains editable. `check:services` checks actor accessibility without running a paid scrape; a real scan verifies the actor input/output contract.

## 6. Cartesia: spoken storefront (optional)

1. Create a [Cartesia account](https://play.cartesia.ai/), configure billing, and create an API key.
2. Choose a stock voice in the voice library that supports your required languages and copy its voice ID. Configure:

```dotenv
CARTESIA_API_KEY=your_private_key
CARTESIA_VOICE_ID=your_voice_id
CARTESIA_MODEL=sonic-3.6
CARTESIA_VERSION=2026-08-14
```

3. Restart the backend. The storefront's audio controls appear when both key and voice are set. Try English and Spanish and confirm item names, prices, and stock match the store. Narration is generated from those facts and cached briefly; it does not invent offers. [Bytes API documentation](https://docs.cartesia.ai/api-reference/tts/bytes).

## 7. Convex: realtime inventory distribution (optional)

SQLite remains the transaction database; Convex distributes public inventory changes. The app also polls as a fallback.

1. Create a [Convex account](https://dashboard.convex.dev/), then from the project root:

```bash
npx convex dev
```

Choose/create your project and let the CLI configure its development deployment. Stop it after initialization. Review `.env.local` afterward; keep `CONVEX_URL` pointed at the deployment you intend to use.

2. Generate a random shared secret locally:

```bash
openssl rand -hex 32
```

3. For production, deploy the functions, then set the same secret on the production deployment:

```bash
npx convex deploy
npx convex env set --prod CONVEX_SYNC_SECRET 'YOUR_GENERATED_SECRET'
```

Run `npx convex deploy` again after upgrading the app. Deleting a storefront calls `inventory:remove`; until it is deployed, the backend logs that Convex sync is pending and keeps retrying the removal.

4. Copy the **production** `.convex.cloud` URL from the Convex dashboard into:

```dotenv
# Backend .env.local
CONVEX_URL=https://YOUR_PRODUCTION_DEPLOYMENT.convex.cloud
CONVEX_SYNC_SECRET=YOUR_GENERATED_SECRET
```

```dotenv
# mobile/.env.local (public URL only)
EXPO_PUBLIC_CONVEX_URL=https://YOUR_PRODUCTION_DEPLOYMENT.convex.cloud
```

5. Restart the backend/Expo or rebuild the native app. Run `npm run check:services` to verify the deployment and shared secret. Publish an item and compare stock on two devices. The maintenance worker retries failed synchronization from a durable outbox. [Deployment documentation](https://docs.convex.dev/production).

## 8. Expo: run and distribute iOS/Android

For your phone during development, keep the Mac and phone on the same Wi-Fi:

```bash
# Terminal 1
cd /Users/neelpatel/Documents/GitHub/snap_a_store
nvm use 22
npm run dev
```

```bash
# Terminal 2
cd /Users/neelpatel/Documents/GitHub/snap_a_store/mobile
nvm use 22
npx expo login
npm start -- --clear
```

Use the Expo Go release compatible with SDK 58, sign in to the same Expo account, and scan the terminal QR. If your Mac's IP changes, update both environment files. Once the backend is deployed, set `EXPO_PUBLIC_API_URL=https://YOUR_DOMAIN` so your phone works away from your Mac; the deployed backend stays running independently.

For installable releases:

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build:configure
npx eas-cli@latest env:set --environment production --name EXPO_PUBLIC_API_URL --value https://YOUR_DOMAIN --visibility plaintext
# If using Convex, create EXPO_PUBLIC_CONVEX_URL in the same EAS environment.
npx eas-cli@latest build --platform all --profile production
```

The preview profile also requires an HTTPS API URL in the EAS `preview` environment. Choose your own available iOS bundle ID and Android package ID in `mobile/app.json` before the first store submission. EAS adds your project ID; do not invent one. Apple/Google developer accounts and signing credentials are needed. Validate the resulting builds on physical iOS and Android devices, then use EAS Submit/TestFlight/Play internal testing as appropriate. [Expo build instructions](https://docs.expo.dev/build/setup/), [EAS environment variables](https://docs.expo.dev/eas/environment-variables/).

Only URLs are public Expo values. Square/Anthropic/Apify/Cartesia keys, seller hashes, and Convex/maintenance secrets stay on the backend.

## 9. Verify the release and protect the data

Run locally with the completed server environment:

```bash
npm run check:config
npm run check:services
npm test
npm run build
npm run backup
```

`check:services` performs read-only account checks; it cannot prove catalog writes, payment webhooks, audio generation, or pricing runs work. Validate those with your actual accounts. Before opening the store, complete a purchase you authorize through Square, check the receipt/payment in Square, confirm inventory changes once, retry the webhook, and verify another buyer cannot buy sold-out stock. Test canceling an unpaid checkout and an abandoned checkout after the worker expires its hold. A test card works only in Square sandbox.

Back up the live database using SQLite's online backup API, not a plain copy of a running WAL database:

```bash
docker compose -f compose.production.yaml exec app node scripts/backup.mjs
```

Backups are written inside the persistent volume at `/app/data/backups`. Schedule this command, copy backups to encrypted off-host storage, and test restore on a separate instance with isolated payment credentials. For restore, stop app and maintenance processes, restore the backup to `DATABASE_PATH`, remove stale WAL/SHM companions only for that stopped database, then restart and reconcile Square before accepting new purchases. Never run a restored duplicate store against the same live inventory.

Keep the old `data/snap.sqlite` for reference if present; the application does not migrate fabricated/sample listings into the live store. Existing store QR codes from that earlier environment are retired.

Current release evidence and the remaining upstream Expo tooling advisory are documented in [VALIDATION.md](VALIDATION.md). Live payment/account testing, physical-device testing, domain configuration, signing, and backup restore must be completed in your environment before calling this deployment production-ready.
