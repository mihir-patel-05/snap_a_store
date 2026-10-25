# Plan: clean Facebook Marketplace posts from published items

Status: proposal, not implemented. Written October 25, 2026.

## Goal

Once a seller has reviewed and published prices, Snap-a-Store helps them put each item on Facebook with as little retyping as possible: a cropped, cleaned photo, a tidy title and description, the correct price, and a matching condition and category. The app keeps SQLite as the inventory authority so an item cannot be sold twice through two channels.

## What Meta allows (checked October 2026)

| Target | Public API? | Consequence for this feature |
| --- | --- | --- |
| **Marketplace listing from a personal profile** | No. Meta offers no public endpoint for individuals to create Marketplace listings. Its Commerce Platform partner APIs are gated to approved partners. The Content Library API covers Marketplace search for approved researchers only and is read-only. | The app prepares the listing. The seller pastes it into Facebook's own **Create listing** form. No automation, browser scripting, or unofficial endpoints. |
| **Facebook Page post** | Yes. Graph API `/{page-id}/photos` (unpublished uploads) plus `/{page-id}/feed` with `attached_media`. Needs `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`. | Real one-tap publishing, but it creates a **Page post, not a Marketplace listing**. Public sellers need Advanced Access, which requires App Review and Business Verification. In development mode only people with a role on the Meta app can connect. |
| **Facebook Group post** | No. The Groups API and `publish_to_groups` were removed in 2024 (Graph v19). | Not offered. |
| **Facebook/Instagram Shops catalog** | Yes, through Commerce Manager catalogs. US Shops moved to website checkout in 2025. | Possible later. It needs Commerce Manager, domain verification, and a checkout URL. It is a separate product with its own inventory risk, so it's out of scope here. |

The UI must never call a Page post or a copied listing a "Marketplace API" integration.

## Recommended shape

Two phases. Phase 1 works for every seller without Meta credentials. Phase 2 is the optional Meta API integration.

### Phase 1: Marketplace listing kit (no Meta credentials)

**Seller flow (native app and `/studio`)**

1. In **The collection**, tapping an item opens a new item sheet instead of the storefront. Today `InventoryRow` opens `storeUrl`.
2. The seller taps **Post on Facebook Marketplace**. The server generates a listing kit once and saves it, so reopening the sheet costs nothing.
3. The kit shows the following, each with its own **Copy** button:
   - the cropped photo, with a **Save photo** button
   - the title
   - the price, read from SQLite and not editable here
   - the category
   - the condition
   - the description
4. **Open Marketplace** opens `https://www.facebook.com/marketplace/create/item`. Meta documents no prefill parameters, so fields are pasted.
5. After posting, the seller taps **I posted it** and can paste the listing URL. The item then shows a "Listed on Facebook" badge.
6. When the item sells on Facebook, **Sold on Facebook** removes it from the storefront immediately. When it sells in the app, the item sheet and home screen show "Mark this sold on Facebook too" until the seller dismisses it.

**Clean photo**

The scan photo shows a whole table, so the main cleanup is cropping to one item.

- Extend the vision schema with an optional normalized `box: { x, y, w, h }` per item, using the same structured-output call in `lib/providers/vision.ts`. Add `box` to `DraftItem` as optional so older clients still validate.
- The listing-photo endpoint crops with `sharp` around the box, adds padding, and uses a square or 4:5 frame. It also auto-orients and re-encodes to JPEG. Sharp drops EXIF/GPS by default, so keep it that way. That protects seller location.
- The crop is labeled "suggested crop". The seller can adjust it or choose **Use whole photo**. If there is no box (older items, low confidence), the whole photo is the default.
- Later: **Add close-up** photos per item (`item_photos` table, same upload limits as `/scan`).
- Don't do AI background removal or generated imagery. The photo must stay the real item.

**Listing copy (Claude)**

- Input: the published item (name, description, category, condition, quantity, price), the seller's general pickup area, and the cropped image. Never the exact pickup address unless the seller adds it.
- Output, using structured output plus Zod: `title`, `description`, `marketplaceCategory` (a suggestion from a maintained list), `tags`, and `warnings[]`.
- Guardrails, enforced in code as well as the prompt:
  - **Price comes only from SQLite.** Reject or regenerate any model text that contains a currency amount other than the item price.
  - Don't state brand, model, authenticity, or working condition unless the item data or seller supplied it, or it is clearly visible. This uses the same rules as the scan prompt.
  - Items marked `Check condition` are blocked until the seller picks a condition. The mapping is Like new → "Used – Like New", Good → "Used – Good", Fair → "Used – Fair". Verify these labels against the live Marketplace form.
  - No eBay comparisons or "sold for" claims. Apify data is asking prices, not sales.
  - No generated phone numbers, emails, or links.
  - Treat item names and image text as untrusted data.
- Rate-limit with a seller-level `seller:listing` key, like `seller:scan`. Missing `ANTHROPIC_API_KEY` fails clearly with 503, as it does today.

**Keeping inventory honest**

CLAUDE.md and the README warn against selling the same stock through a separate channel. This feature creates that channel, so it needs:

- `POST /api/stores/:id/items/:itemId/sold-elsewhere { quantity, requestKey }`. This is a repo transaction that decrements `remaining` without going below stock held by open checkouts. It is idempotent per request key, calls `touch()` so Convex and the outbox update, and logs "Sold on Facebook · {name}". It does **not** add revenue, because the app never saw that payment.
- No Square call is needed: catalog variations use `track_inventory: false`.

**Better shared links (also helps Phase 2)**

- Per-item deep link: `/s/:storeId?item=:itemId` opens that item in `components/storefront.tsx`.
- `generateMetadata` in `app/s/[storeId]/page.tsx` adds Open Graph title, description, and the cropped `og:image` (published photos only). Links pasted into Messenger, Pages, or Marketplace chats then render cleanly. Today every storefront shares the generic site metadata.

**API (Phase 1)**

| Method and path | Purpose |
| --- | --- |
| `GET /api/stores/:id/items/:itemId/listing` | Saved kit, or 404 |
| `POST /api/stores/:id/items/:itemId/listing` | Generate or regenerate the kit (Claude, rate-limited) |
| `PATCH /api/stores/:id/items/:itemId/listing` | Seller edits to text, category, condition, crop, and the Facebook status/URL |
| `GET /api/stores/:id/items/:itemId/listing-photo` | Cropped, metadata-free JPEG. Public only for published items, matching `publishedPhoto` |
| `POST /api/stores/:id/items/:itemId/sold-elsewhere` | Offline sale, as above |

All seller routes use the existing `auth(req, id)` ownership check. The item must belong to that store. Item IDs contain `:`, so encode them in URLs.

**Data (SQLite)**

- `listing_kits (item_id PK REFERENCES items(id), store_id, data, updated_at)`. `data` holds the copy, crop, and `facebook: { status, url?, postedAt?, postId? }`.
- `offline_sales (request_key PK, store_id, item_id, quantity, at)`.
- `deleteStore` removes both. Extend the deletion-completeness test.

**Native app**

- New `mobile/components/listing-kit.tsx`, so `App.tsx` (about 2,700 lines) doesn't grow further.
- Add `expo-media-library` to save photos, with an add-only photo permission string in `app.config.ts`. This is a new native module, so the feature needs a **new EAS build**; the current TestFlight binary won't have it. Clipboard and Linking are already installed.

### Phase 2: publish to the seller's Facebook Page (Meta Graph API, opt-in)

Use this only if the target sellers run a Facebook Page. Most casual sellers list on Marketplace from a personal profile, and Phase 1 covers them.

- **Connect a Page per storefront**, mirroring Square OAuth in `lib/server/oauth.ts`:
  - Add ticket kinds `facebook-launch`/`facebook`, the browser-bound state cookie, and `/api/auth/facebook/authorize` and `/api/auth/facebook/callback`. Native returns to `snapastore://facebook`.
  - Exchange the code for a long-lived user token, then list Pages through `/me/accounts`. The seller picks one, and its Page token is stored.
  - Encrypt with the existing AES-256-GCM helper, with AAD bound to the store and provider. Generalize `encryptTokens`/`decryptTokens` instead of copying them.
  - New table `facebook_connections (store_id PK REFERENCES stores(id), page_id, page_name, encrypted)`. Never link Facebook identities to Google accounts by email.
- **Publish a post**: `POST /api/stores/:id/items/:itemId/facebook-post { requestKey }`.
  1. Upload the cropped photo bytes to `/{page-id}/photos` with `published=false`.
  2. Create `/{page-id}/feed` with the kit text, the price, the item deep link, and `attached_media`.
  3. The Graph API has no idempotency keys. Record `facebook_posts (request_key PK, item_id, state, post_id)` as `creating` before calling. If the result is uncertain, don't post again automatically: ask the seller to check the Page first, the same way uncertain publishes are handled.
- **When the item sells**, queue a durable edit of the post that prepends "SOLD", retried by the maintenance worker like the Convex outbox. Don't delete the post silently.
- **Disconnect or delete the storefront** removes the saved token and connection. Deleting posts is offered, not automatic.
- **Configuration**: `META_APP_ID`, `META_APP_SECRET`, and `META_GRAPH_VERSION`, pinned to the current version at implementation time.
  - Add Facebook to `integrations()` with "setup" status when credentials are missing. Endpoints return a clear 503.
  - Add a read-only app credential check to `check:config` and `check:services`.
  - Register `PUBLIC_BASE_URL/api/auth/facebook/callback` as a valid OAuth redirect.
- **Meta review**: until App Review and Business Verification are approved, only app-role users (the team's own Page) can connect. That is enough for a demo, not for public sellers. Allow days to weeks for review.

### Not doing

- Scripting or automating facebook.com, or unofficial Marketplace endpoints. They break Meta's terms and the "real services only" rule.
- Group posting (no API).
- Generated or "enhanced" product imagery.
- Claiming Meta sponsor eligibility. Meta isn't in `docs/SPONSOR-TRACKS.md`.

## Tests (Vitest, external services mocked at the boundary)

- Kit generation:
  - Requires the store owner. Other sellers and the password seller get 403.
  - Kit price always equals the SQLite price. Model text with another amount is rejected.
  - `Check condition` is blocked.
  - Malformed model output returns 502 with a clear message. A missing key returns 503.
  - The rate limit applies per seller.
- Photo:
  - The box is clamped to image bounds.
  - Output carries no EXIF/GPS.
  - Unpublished items' photos aren't public.
  - Items without a box fall back to the whole photo.
- `sold-elsewhere`:
  - Idempotent per key.
  - Can't take stock held by an open checkout.
  - Bumps revision and the outbox.
  - Leaves revenue unchanged.
  - Returns 404 after the store is deleted.
- Storefront deletion removes kits, offline sales, and Facebook rows.
- Phase 2:
  - OAuth state, cookie, and ticket checks, mirroring `tests/oauth.test.ts`.
  - Token AAD binding: one store's ciphertext fails for another store.
  - Exact Graph request construction.
  - An uncertain post failure never double-posts.
  - Missing Meta credentials give 503 and "setup" status.
- Then, per CLAUDE.md, run `npm test`, `npm run typecheck`, `npm run build`, and, in `mobile/`, `npm run typecheck` and `npm run export`.

Manual checks: paste a kit into the real Marketplace form on iOS and Android to confirm field labels, the photo limit, and the condition and category names. Then record the results in `docs/VALIDATION.md`.

## Build order

1. Add `box` to the vision schema and `DraftItem`, plus the listing-photo crop endpoint.
2. Add `listing_kits`, kit generation and editing, and tests.
3. Add `sold-elsewhere` and the "mark sold on Facebook" reminders, with tests.
4. Build the native item sheet and listing kit, and add `expo-media-library` (needs a new EAS build).
5. Bring the `/studio` web version to parity.
6. Add per-item deep links and Open Graph metadata.
7. Phase 2, if wanted: Facebook Page OAuth, posting, the sold-edit outbox, and docs (`docs/FACEBOOK.md`, README, `.env.example`).

Rough size: Phase 1 is about 2–3 focused days. Phase 2 is about 2–3 days plus Meta's review time.

## Open decisions

1. **Who is the target: personal Marketplace sellers (Phase 1) or Page owners (Phase 2)?** This decides whether Phase 2 is worth the Meta review.
2. **Should the Marketplace description include the storefront checkout link?** Linking off Facebook may conflict with Meta's Commerce Policies; I couldn't retrieve the current text to confirm. The proposed default is off, with buyers messaging the seller, who can reply with the link.
3. **Should a Facebook sale record a seller-entered price?** It would be marked unverified and kept out of revenue. The default is to record only the quantity.

## Sources

- [Meta Graph API: Page photos](https://developers.facebook.com/docs/graph-api/reference/page/photos)
- [Meta Pages API: posts](https://developers.facebook.com/documentation/pages-api/posts)
- [Meta Commerce Platform: partner integration](https://developers.facebook.com/documentation/ads-commerce/commerce-platform/partners.md)
- [Meta Content Library API: Facebook Marketplace](https://developers.facebook.com/docs/content-library-and-api/content-library-api/guides/fb-marketplace)
- [Graph API v19 Groups API deprecation thread](https://developers.facebook.com/community/threads/2076398286093257/)
- [Meta phases out Shops checkout (PPC Land)](https://ppc.land/meta-phases-out-facebook-and-instagram-shops-checkout-by-august-2025/)
- [Square: connect Square Online with Meta for Business](https://squareup.com/help/us/en/article/7887-connect-square-online-with-meta-for-business)
