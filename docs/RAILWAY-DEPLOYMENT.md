# Deploy Snap-a-Store to Railway

This guide deploys **both the backend and the web frontend** from this repository. One Railway web service runs Next.js and serves the customer storefront, seller web interface, API, and Square webhooks. A second, small service runs payment maintenance.

The Expo iOS/Android app in `mobile/` connects to the Railway API. Its installable native builds are created separately with Expo EAS; Railway does not produce an IPA or APK.

## What you will deploy

| Component | Railway service | Public address |
| --- | --- | --- |
| Website and seller web interface | `snap-backend` | `/` and `/studio` |
| Customer storefront | `snap-backend` | `/s/STORE_ID`, generated when you publish |
| Backend API and Square webhooks | `snap-backend` | `/api/...` |
| Payment reconciliation worker | `snap-maintenance` | No public domain |
| SQLite database, including listing photos | Volume attached to `snap-backend` | Mounted at `/app/data` |

Use one backend replica. This application supports one Square merchant/location, USD prices, and local pickup. The Railway deployment starts with a new database; it does not automatically upload the database on your Mac.

You need access to the GitHub repository, a Railway account, a Claude API key with API billing, and production Square credentials for your active payment-enabled location. Railway's [pricing page](https://railway.com/pricing) lists current plan and usage costs. The Hobby plan has a $5 monthly minimum including $5 of usage; additional usage costs extra.

## 1. Prepare your GitHub code and seller login

Run on your Mac:

```bash
cd /Users/neelpatel/Documents/GitHub/snap_a_store
nvm use 22
git status --short
git push origin main
```

Commit any application changes you intend to deploy before pushing. The repository is `mihir-patel-05/snap_a_store`, and the deployment branch is `main`. Keep `.env.local`, mobile environment files, and local databases out of GitHub.

If you have not created a seller login yet:

```bash
npm run setup:seller
```

Enter your email and a password of at least 14 characters. The script saves these values in the root `.env.local`:

- `SELLER_EMAIL`
- `SELLER_PASSWORD_HASH`
- `MAINTENANCE_SECRET`

Open that file in your editor to copy the values into Railway later. Copy the entire hash beginning with `scrypt:`; the hash is not the password you type when signing in. Running setup again changes the login hash and revokes existing sessions once deployed.

## 2. Create the backend and web frontend service

1. Open [Railway](https://railway.com) and sign in with GitHub.
2. Choose **New Project → Deploy from GitHub repo**.
3. Select **`mihir-patel-05/snap_a_store`**. If missing, configure Railway's GitHub app access to include that repository.
4. Choose **Add Variables** if offered, so you can finish configuration before deploying.
5. Rename the service **`snap-backend`**. Use this exact name because the worker settings below reference it.
6. Open the service's **Settings** and configure:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Root directory | `/` |
| Builder | Dockerfile, automatically detected |
| Dockerfile path | `Dockerfile` |
| Custom build command | Leave empty |
| Custom start command | `node server.js` |
| Healthcheck path | `/api/health` |
| Replicas | `1` |
| Serverless / sleeping | Disabled |

Use the repository root, not `/mobile`. The Dockerfile already installs dependencies and runs the Next.js production build. Its runtime starts `server.js`; do not substitute `npm run dev` or `npm start` in this Docker service.

Railway handles HTTPS, so this workflow uses the Dockerfile directly. The separate Caddy/Docker Compose deployment in the service setup guide is an alternative hosting method and is not part of these Railway steps.

References: [Railway quick start](https://docs.railway.com/quick-start), [Dockerfiles](https://docs.railway.com/builds/dockerfiles), [start commands](https://docs.railway.com/deployments/start-command).

## 3. Attach permanent storage before publishing anything

1. On the Railway project canvas, right-click an empty area and select **Create Volume**. Alternatively, press **⌘K** and search for **Create Volume**.
2. Attach the volume to **`snap-backend`**.
3. Set the mount path to:

```text
/app/data
```

The database will be `/app/data/snap-live.sqlite`. Listing photos are also stored in this database. Preserve this volume across deployments; deleting it deletes the hosted store's data.

The current Docker image normally runs as a non-root user. Railway mounts volumes as root, so the backend variables in the next step include Railway's documented `RAILWAY_RUN_UID=0` setting to allow writes.

References: [create a volume](https://docs.railway.com/volumes), [volume permissions and limits](https://docs.railway.com/volumes/reference).

## 4. Add private backend variables

Open **snap-backend → Variables → Raw Editor**. Paste this block and replace every `REPLACE_...` value before saving:

```dotenv
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
DATABASE_PATH=/app/data/snap-live.sqlite
RAILWAY_RUN_UID=0

SQUARE_ENVIRONMENT=production
SQUARE_ACCESS_TOKEN=REPLACE_WITH_PRODUCTION_ACCESS_TOKEN
SQUARE_LOCATION_ID=REPLACE_WITH_PRODUCTION_LOCATION_ID

ANTHROPIC_API_KEY=REPLACE_WITH_CLAUDE_API_KEY
ANTHROPIC_MODEL=claude-sonnet-5-5

SELLER_EMAIL=REPLACE_WITH_EMAIL_FROM_LOCAL_ENV
SELLER_PASSWORD_HASH=REPLACE_WITH_ENTIRE_HASH_FROM_LOCAL_ENV
MAINTENANCE_SECRET=REPLACE_WITH_SECRET_FROM_LOCAL_ENV

BUSINESS_NAME=REPLACE_WITH_YOUR_STORE_NAME
SUPPORT_EMAIL=REPLACE_WITH_YOUR_SUPPORT_EMAIL
PICKUP_INSTRUCTIONS=REPLACE_WITH_YOUR_PICKUP_DETAILS
RETURN_POLICY=REPLACE_WITH_YOUR_RETURN_POLICY
SALES_TAX_PERCENT=REPLACE_WITH_YOUR_APPLICABLE_RATE
```

Where each value comes from:

- **Square:** [Developer Console](https://developer.squareup.com/apps) → your application → **Production** credentials and location. Use the same merchant and location for the whole deployment.
- **Claude:** [Claude Console](https://platform.claude.com/) → API key. API billing is separate from a Claude chat subscription. The configured [Sonnet 5.5 model](https://platform.claude.com/docs/en/models/sonnet-5-5/overview) must be available to your account.
- **Seller and maintenance:** the three generated values in your local `.env.local` from step 1.
- **Business details:** your real store name, support address, pickup instructions, and return policy. Enter the sales tax percentage as a number without `%`; the app accepts 0–30 with up to four decimal places. Use your applicable rate.

The public URL and webhook signature key come in the following steps. Do not use placeholder credentials to bypass readiness checks. Optional Apify, Cartesia, and Convex variables can be added later using [Service setup](SERVICE-SETUP.md).

Click **Save**, then **Deploy / Apply Changes**. Railway variable changes are staged until deployed. The initial `/api/health` check can pass before the public URL and payment configuration are complete; selling is not ready yet.

Reference: [Railway variables](https://docs.railway.com/variables).

## 5. Generate one HTTPS address for the frontend and backend

After the initial deployment is running:

1. Open **snap-backend → Settings → Networking**.
2. Click **Generate Domain**.
3. Set the target port to **`3000`**.
4. Copy the generated HTTPS address.

In the examples below, replace `YOUR-GENERATED-DOMAIN` with the actual hostname Railway gives you. Do not include `https://` twice.

Return to **snap-backend → Variables** and add:

```dotenv
PUBLIC_BASE_URL=https://YOUR-GENERATED-DOMAIN
ALLOWED_ORIGINS=https://YOUR-GENERATED-DOMAIN
SQUARE_WEBHOOK_URL=https://YOUR-GENERATED-DOMAIN/api/webhooks/square
```

Use no trailing slash on `PUBLIC_BASE_URL`. Save and deploy the changes. Railway provisions HTTPS automatically; you can use its generated address without buying a custom domain.

Reference: [Railway public networking](https://docs.railway.com/networking/public-networking).

## 6. Connect Square payment notifications

1. Open the [Square Developer Console](https://developer.squareup.com/apps).
2. Open the same application used for your access token and select **Production**.
3. Go to **Webhooks → Subscriptions → Add subscription**.
4. Name it `Snap-a-Store`.
5. Enter this notification URL using your actual Railway hostname:

```text
https://YOUR-GENERATED-DOMAIN/api/webhooks/square
```

6. Select API version **`2026-09-16`**, matching the application.
7. Subscribe to **`payment.created`** and **`payment.updated`**.
8. Save, open the subscription, and reveal its **Signature Key**.
9. In **snap-backend → Variables**, add:

```dotenv
SQUARE_WEBHOOK_SIGNATURE_KEY=REPLACE_WITH_SIGNATURE_KEY
```

10. Deploy the backend's pending changes.

The Square notification URL must exactly match `SQUARE_WEBHOOK_URL`, including any trailing slash. A mismatch causes signature verification to fail.

Reference: [Square webhook subscription instructions](https://developer.squareup.com/docs/webhooks/step2subscribe).

## 7. Add the payment maintenance worker

Create this inside the **same Railway project**:

1. Choose **New → GitHub Repo** and select the same `snap_a_store` repository.
2. Rename the new service **`snap-maintenance`**.
3. Use branch **`main`**, root directory **`/`**, and the existing **`Dockerfile`**.
4. Set **Custom Start Command** to:

```bash
node scripts/maintenance.mjs --watch
```

5. Leave the worker's healthcheck path empty, keep one replica, and disable serverless/sleeping.
6. In **snap-maintenance → Variables → Raw Editor**, paste these references exactly:

```dotenv
PUBLIC_BASE_URL=${{snap-backend.PUBLIC_BASE_URL}}
MAINTENANCE_SECRET=${{snap-backend.MAINTENANCE_SECRET}}
```

7. Save and deploy the worker.

Railway resolves the references from `snap-backend`. The worker calls the backend about once per minute to reconcile payments and attempt cancellation of expired reservations. It does not access the database directly and needs **no volume, public domain, Square token, or Claude key**.

## 8. Verify the hosted app

Open these addresses with your actual hostname:

```text
https://YOUR-GENERATED-DOMAIN/
https://YOUR-GENERATED-DOMAIN/api/health
https://YOUR-GENERATED-DOMAIN/api/ready
https://YOUR-GENERATED-DOMAIN/studio
```

Expected results:

- `/` shows the website.
- `/api/health` includes `"ok": true`.
- `/api/ready` returns `{"ready":true,"environment":"production"}`.
- `/studio` accepts the seller email and password created in step 1.
- `snap-maintenance` logs show periodic results with `"failed":0`.

The readiness endpoint checks required configuration and database access. It does not certify external credentials or prove a payment works. Verify a real photo scan, item publication, generated storefront link, and Square checkout. Confirm a completed payment updates the order and stock before accepting customer payments.

The public customer storefront address is generated by the app when you publish. It looks like `/s/STORE_ID`; `STORE_ID` is an actual saved store ID, not a value to invent.

## 9. Connect the Expo app

In `mobile/.env.local`, change only the API URL line:

```dotenv
EXPO_PUBLIC_API_URL=https://YOUR-GENERATED-DOMAIN
```

Preserve any configured `EXPO_PUBLIC_CONVEX_URL`. Then restart Expo:

```bash
cd /Users/neelpatel/Documents/GitHub/snap_a_store/mobile
nvm use 22
npx expo start --clear
```

For an EAS preview build, set the same address in the preview environment:

```bash
npx eas-cli@latest env:set \
  --environment preview \
  --name EXPO_PUBLIC_API_URL \
  --value https://YOUR-GENERATED-DOMAIN \
  --visibility plaintext
```

For an EAS production build, run the same command with `--environment production`. Build again after changing an API URL already embedded in an installed native build.

Only public URLs belong in `EXPO_PUBLIC_*`. Keep API keys, password hashes, and maintenance secrets on the backend. Once the mobile app points to Railway, your Mac's local backend can be stopped.

## 10. Keep the deployment running

- Preserve the backend volume and use one backend replica. A volume-backed deployment can have brief downtime during redeployment.
- Enable volume backups in Railway and follow the SQLite backup/restore guidance in [Service setup](SERVICE-SETUP.md). Test restores before relying on them.
- Monitor `/api/ready` and recurring worker failures. Railway's deployment healthcheck is not continuous external uptime monitoring.
- Push application updates to the linked `main` branch to trigger deployments when GitHub autodeploy is enabled. Both services should track the same code.
- If you change the public hostname, update backend URL variables, the Square subscription URL, and the Expo API URL together.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Repository is missing from Railway | Grant Railway's GitHub app access to `mihir-patel-05/snap_a_store`. |
| Build tries to deploy Expo | Root directory must be `/`; verify the logs show the root Dockerfile. |
| `server.js` cannot be found | Verify the Dockerfile is being used. Its runtime copies the standalone Next.js server into `/app`. |
| 502 / application failed to respond | Set `PORT=3000`, `HOSTNAME=0.0.0.0`, domain target port `3000`, and start command `node server.js`. Inspect backend deployment logs. |
| Read-only database / permission denied | Verify volume mount `/app/data`, database path `/app/data/snap-live.sqlite`, and backend variable `RAILWAY_RUN_UID=0`; redeploy. |
| `/api/health` works but `/api/ready` fails | Read the JSON error and configure the named missing setting. Check HTTPS public URL, business settings, and webhook key. |
| Seller login fails | Use the original password, not its hash. Copy the entire generated hash into Railway and deploy the variable changes. |
| Worker gets HTTP 401 | Its maintenance secret must match the backend. Check the service references and redeploy. |
| Worker reports failures | Inspect backend logs and verify Square credentials, location, and payment status. Do not manually release stock while payment status is uncertain. |
| Square webhook signature fails | Match the exact URL and production subscription signature key on both sides. |
| Native app still calls the Mac | Update `mobile/.env.local`, restart Expo with `--clear`, or update the EAS environment and rebuild the installed app. |

Full account setup for required and optional services: [Service setup](SERVICE-SETUP.md). Current verification limits: [Validation](VALIDATION.md).
