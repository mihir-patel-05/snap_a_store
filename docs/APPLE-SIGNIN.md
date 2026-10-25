# Sign in with Apple

Apple sign-in works like Google sign-in: the backend runs the authorization-code flow, every Apple account gets its own isolated store, and sellers then connect their own Square account. The website and the native app (iOS and Android) both use the backend's HTTPS callback, then the backend returns to the app through `snapastore://auth`.

Only Apple's stable user ID is used. The app asks Apple for no name or email, so nothing is linked by email and Apple's private relay addresses never matter. Stores are kept separately for sandbox and production.

## Requirements

- A paid [Apple Developer Program](https://developer.apple.com/programs/) membership.
- A public HTTPS backend. Apple does not accept `http://` or `localhost` return URLs, so test on the deployed Railway domain or an HTTPS tunnel.

## 1. Apple Developer setup

Sign in to [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list).

1. **Team ID.** Copy it from the top right of the Apple Developer site, or from **Membership details**. This is `APPLE_TEAM_ID`.
2. **App ID.** Under **Identifiers**, open or create the App ID for the native app, `com.snapastore.mobile` (from `mobile/app.json`). Enable the **Sign in with Apple** capability and save.
3. **Services ID.** Under **Identifiers**, click **+**, choose **Services IDs**, and register an identifier such as `com.snapastore.web`. It must differ from the App ID. This is `APPLE_SERVICES_ID`.
4. Open the Services ID, tick **Sign in with Apple**, and click **Configure**:
   - **Primary App ID:** `com.snapastore.mobile`
   - **Domains and subdomains:** `YOUR_DOMAIN` (no `https://`), for example `snapastore-production.up.railway.app`
   - **Return URLs:** `https://YOUR_DOMAIN/api/auth/apple/callback`

   Save, then click **Continue** and **Save** on the Services ID.
5. **Key.** Under **Keys**, click **+**, name it, enable **Sign in with Apple**, click **Configure**, choose `com.snapastore.mobile`, and register it. Download the `.p8` file; Apple lets you download it only once. The **Key ID** on that page is `APPLE_KEY_ID`.

## 2. Backend variables

```dotenv
APPLE_SERVICES_ID=com.snapastore.web
APPLE_TEAM_ID=YOUR_TEAM_ID
APPLE_KEY_ID=YOUR_KEY_ID
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
```

`APPLE_PRIVATE_KEY` is the full contents of the `.p8` file. Paste it with its real line breaks, or on one line with `\n` between lines. Keep it with your other server secrets; never commit it or put it in Expo.

Apple sign-in also needs the same Square application variables and `OAUTH_ENCRYPTION_KEY` as Google signup (see [GOOGLE-SIGNIN.md](GOOGLE-SIGNIN.md)). The **Continue with Apple** button appears only when all four Apple variables are set, and `/api/ready` fails clearly if only some are set or the key cannot be read.

Redeploy after changing variables. No Apple secret is needed in the Expo app, and no native rebuild is needed beyond the one already required for Google sign-in.

## 3. Verify

1. Open `https://YOUR_DOMAIN/studio` and choose **Continue with Apple**.
2. Approve with an Apple ID. The first sign-in creates a store; signing in again reopens it.
3. Sign in with a second Apple ID and confirm it gets a separate store.
4. In the installed iOS and Android builds, choose **Continue with Apple** and confirm the app opens signed in. Cancel once and confirm you return to the login screen.

Common Apple errors:

- **invalid_client:** `APPLE_SERVICES_ID` does not match the Services ID, or the Services ID does not have Sign in with Apple enabled.
- **invalid_request / redirect mismatch:** the return URL registered on the Services ID differs from `PUBLIC_BASE_URL` + `/api/auth/apple/callback`.
- **"Apple did not return an identity token":** the team ID, key ID, or `.p8` key does not match, or the key is not linked to the Services ID's primary App ID.

## Limits

The iOS build uses Apple's web authorization sheet through the backend, not the native Sign in with Apple prompt. If App Review asks for the native prompt, it can be added with `expo-apple-authentication` and a backend check of the native identity token's audience (`com.snapastore.mobile`).

Apple's automated tests mock only Apple's HTTP responses; they check the signed client secret, ID-token signature, issuer, audience, expiry, nonce, cancellation, and one-time mobile grants. A real Apple authorization has not been performed by the code tests.
