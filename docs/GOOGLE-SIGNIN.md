# Google signup and each seller's Square account

This revision adds public Google signup on the web dashboard and in the native Expo app. Each Google identity gets an isolated store. Sellers connect their own Square merchant, select an active USD payment location, and enter their own support email, pickup instructions, return policy, and tax rate before publishing.

Existing password accounts keep their existing stores and the server-configured Square account. Google signup creates a separate store even when its email matches the legacy seller email. Stores are never merged by email. The Google account's stable subject ID identifies its store, with separate stores for sandbox and production.

## 1. Google Cloud

1. In the [Google Cloud credentials console](https://console.cloud.google.com/apis/credentials), create or select a project and configure Google Auth Platform branding, audience, and contact details.
2. Set the audience to External for public signup. While the app is in Testing, explicitly add the accounts that will test it. Publish the consent configuration when ready for other sellers.
3. Create an OAuth client with application type **Web application**.
4. Add this exact authorized redirect URI, substituting your existing deployed backend address:

   `https://YOUR_DOMAIN/api/auth/google/callback`

5. Save these values in the backend service's private Railway variables:

   ```dotenv
   GOOGLE_CLIENT_ID=your_web_oauth_client_id
   GOOGLE_CLIENT_SECRET=your_web_oauth_client_secret
   ```

Only OpenID, email, and profile scopes are requested. This integration uses a server authorization-code flow, so the same backend OAuth client serves the website and native app. It does not require a Google Maps key, Gmail permissions, Firebase, or a Google secret in Expo.

Google's documentation: [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [server-side identity verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## 2. Square seller connections

Open the Square Developer Console application that supplies this deployment's webhook subscription. Under OAuth, register:

`https://YOUR_DOMAIN/api/auth/square/callback`

Add its credentials to the backend:

```dotenv
SQUARE_APPLICATION_ID=your_square_application_id
SQUARE_APPLICATION_SECRET=your_square_application_secret
```

The application secret is distinct from the existing personal access token. New sellers authorize the application through Square; their tokens stay on the server. The existing `SQUARE_ACCESS_TOKEN` and `SQUARE_LOCATION_ID` remain for the legacy password store only.

The OAuth request asks for merchant/location read, catalog read/write, orders read/write, and payments read/write. Keep the application's signed `payment.created` and `payment.updated` webhook subscription pointed at:

`https://YOUR_DOMAIN/api/webhooks/square`

Keep `SQUARE_WEBHOOK_SIGNATURE_KEY` configured. Confirm that the subscription receives events for connected OAuth sellers in the intended Square environment. A successful OAuth callback alone does not prove webhook delivery.

Square documentation: [OAuth overview](https://developer.squareup.com/docs/oauth-api/overview), [authorization URLs](https://developer.squareup.com/docs/oauth-api/create-urls-for-square-authorization), [token exchange](https://developer.squareup.com/reference/square/o-auth-api/obtain-token).

## 3. Encrypt seller payment credentials

Generate a separate 32-byte encryption key on a trusted machine:

```bash
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Store the resulting 64 hexadecimal characters as the backend's `OAUTH_ENCRYPTION_KEY`. This is not a Google or Square API key. Keep it with your protected deployment secrets and database recovery material. Changing or losing it makes existing Square connections unreadable; don't regenerate it during redeploys.

Square access and refresh tokens are encrypted using AES-256-GCM and bound to their store ID. Access tokens refresh on demand. Connecting a different Square merchant to an existing store is rejected; payment locations cannot change after listings or orders exist.

## 4. Deploy and connect the app

Keep the existing `PUBLIC_BASE_URL` at your deployed HTTPS origin. Apply the new backend variables and deploy the changed code. No production secret belongs in Git.

The backend adds three SQLite tables without replacing existing data: Google account mappings, expiring OAuth tickets, and encrypted Square connections. Continue using one backend replica with persistent storage and the payment maintenance worker.

For Google-only deployments, `SELLER_EMAIL` and `SELLER_PASSWORD_HASH` are optional. Keep them when retaining the existing password account. Keep `ANTHROPIC_API_KEY`, `MAINTENANCE_SECRET`, and the Square webhook configuration. Each new seller supplies their own business settings.

The Expo app still only needs `EXPO_PUBLIC_API_URL` and the optional public Convex URL. It uses the registered `snapastore` scheme, with `snapastore://auth` and `snapastore://square` callbacks. Google redirects to the backend's HTTPS callback; the backend then returns to the app.

The new `expo-web-browser` dependency requires rebuilding the installed preview/production app. This flow requires an installed build with the custom scheme; Expo Go is not supported for these callbacks. Expo web opens the backend web dashboard for Google signup. Existing password login continues working in Expo Go.

Expo reference: [WebBrowser authentication sessions](https://docs.expo.dev/versions/latest/sdk/webbrowser/).

## 5. Seller flow

1. Select **Continue with Google**. The first login creates the seller's store; later logins reopen it.
2. Select **Connect Square** and authorize that seller's merchant account.
3. Choose a payment location if the merchant has more than one eligible location.
4. Save support email, pickup instructions, return policy, and the applicable sales-tax percentage.
5. Scan, review, publish, and share the store. Checkout and reconciliation use that store's credentials and location.
6. Buyers see that store's own pickup and return policies.

If Google or Square authorization is canceled, return to the login or connection screen and retry. If a Square authorization is revoked in Square, reconnect the same merchant before using payments again.

## 6. Validation and limits

Run the root tests, typecheck and build, plus native typecheck and exports. The OAuth tests exercise browser-bound state, nonce validation, callback expiry/replay, one-time mobile PKCE grants, identity isolation, encrypted tokens, refresh, owner-only settings, and merchant-bound webhooks. Provider responses are mocked only at the test boundary.

After configuring real credentials, verify Google login and cancellation on the deployed website and installed iOS/Android apps. Use two distinct Google accounts to verify separate stores. Connect two merchant accounts in Square sandbox first; confirm each catalog and checkout uses the correct merchant, including webhook delivery, cancellation, and maintenance. Deploy matching production application credentials before live sales.

Google and Square configuration cannot be completed just by editing repository files. Their console redirect registrations and private backend variables are required. No live authorization, real payment, or signed native distribution is performed by the code tests.

Platform service keys for image recognition, price research, and narration remain shared. Public signup therefore permits authenticated sellers to use those services within the existing request limits. Shipping, refunds in the app, multiple currencies, teams sharing a store, and automatic merging of existing stores are outside this revision.
