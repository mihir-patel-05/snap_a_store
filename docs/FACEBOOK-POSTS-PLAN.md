# Plan: clean Facebook Marketplace posts from published items

Status: proposal, not implemented. Written October 25, 2026, then updated the same day with the seller's decisions.

## Goal

Once a seller has reviewed and published prices, Snap-a-Store helps them list each item on Facebook Marketplace with as little retyping as possible: a cropped, cleaned photo, a tidy title and description, the correct price, and a matching condition and category.

Buyers who find an item on Marketplace buy it there, through Marketplace's own messaging and meetup flow. The post doesn't send them to the storefront. Snap-a-Store's job is to make the listing and keep SQLite stock correct, so an item sold on Facebook can't also be bought in the storefront.

## Decisions (October 25, 2026)

1. **Target sellers: personal Marketplace users.** The Meta Graph API Page-posting phase is dropped; see "Considered and deferred".
2. **Buyers buy through Facebook Marketplace.** Listings contain no storefront or checkout link.
3. **A Facebook sale records only the quantity.** No seller-entered price and no revenue, because the app never sees that payment.

## What Meta allows (checked October 2026)

Meta has no public API for individuals to create Marketplace listings. Its Commerce Platform partner APIs are limited to approved partners. The Content Library API covers Marketplace search for approved researchers only and is read-only.

So the app prepares the listing and the seller pastes it into Facebook's own **Create listing** form. There's no automation, browser scripting, or unofficial endpoint. The UI must not call this a "Meta API" or "Marketplace API" integration.

## Seller flow (native app and `/studio`)

1. In **The collection**, tapping an item opens a new item sheet. Today `InventoryRow` just opens `storeUrl`.
2. The seller taps **List on Facebook Marketplace**. The server generates a listing kit once and saves it, so reopening the sheet costs nothing.
3. The kit shows the following, each with its own **Copy** button:
   - the cropped photo, with a **Save photo** button
   - the title
   - the price, read from SQLite and not editable here
   - the category
   - the condition
   - the description
4. **Open Marketplace** opens `https://www.facebook.com/marketplace/create/item`. Meta documents no prefill parameters, so fields are pasted.
5. After posting, the seller taps **I listed it** and can paste the listing URL. The item then shows a "Listed on Facebook" badge.
6. Facebook buyer activity is kept in step with the storefront:
   - **Pending on Facebook** holds the item when a Marketplace buyer commits to a pickup. It disappears from the storefront but stays in the seller's stock.
   - **Release** returns a held item to the storefront if that buyer doesn't show up.
   - **Sold on Facebook** records the sale and removes the stock.
7. When an item sells in the storefront and it was listed on Facebook, the item sheet and home screen show **Mark this sold on Facebook too** until the seller dismisses it.

## Clean photo

The scan photo shows a whole table, so the main cleanup is cropping to one item.

- Extend the vision schema with an optional normalized `box: { x, y, w, h }` per item, using the same structured-output call in `lib/providers/vision.ts`. Add `box` to `DraftItem` as optional so older clients still validate.
- The listing-photo endpoint crops with `sharp` around the box, adds padding, and uses a square or 4:5 frame. It also auto-orients and re-encodes to JPEG. Sharp drops EXIF/GPS by default, so keep it that way. That protects the seller's location.
- The crop is labeled "suggested crop". The seller can adjust it or choose **Use whole photo**. If there is no box (older items, low confidence), the whole photo is the default.
- Later: **Add close-up** photos per item (`item_photos` table, same upload limits as `/scan`).
- Don't do AI background removal or generated imagery. The photo must stay the real item.

## Listing copy (Claude)

- **Input:** the published item (name, description, category, condition, quantity, price) and the cropped image. The seller's pickup text is left out unless the seller adds it, because it may hold an exact address. Marketplace has its own location field.
- **Output:** structured output plus Zod: `title`, `description`, `marketplaceCategory` (a suggestion from a maintained list), `tags`, and `warnings[]`.
- **Guardrails, enforced in code as well as the prompt:**
  - **Price comes only from SQLite.** Reject or regenerate any model text that contains a currency amount other than the item price.
  - Don't state brand, model, authenticity, or working condition unless the item data or seller supplied it, or it is clearly visible. These are the same rules as the scan prompt.
  - Items marked `Check condition` are blocked until the seller picks a condition. The mapping is Like new → "Used – Like New", Good → "Used – Good", Fair → "Used – Fair". Verify these labels against the live Marketplace form.
  - No links of any kind, including the storefront (decision 2). Also no generated phone numbers or emails. Reject output that contains them.
  - No eBay comparisons or "sold for" claims. Apify data is asking prices, not sales.
  - Treat item names and image text as untrusted data.
- Rate-limit with a seller-level `seller:listing` key, like `seller:scan`. A missing `ANTHROPIC_API_KEY` fails clearly with 503, as it does today.

## Keeping inventory honest

CLAUDE.md and the README warn against selling the same stock through a separate channel. Marketplace is now that channel, so stock changes made on Facebook have to reach SQLite:

- **Hold** (`facebook_holds`): a held quantity reduces `available` exactly like an open checkout does.
  - `snapshot()` and `reserve()` must both count holds. This touches the transactional reservation code, so the existing stock-limit and competing-checkout tests must keep passing, plus new ones.
  - A hold can't take stock already reserved by an open checkout.
  - Holds don't expire on their own. The seller releases them or converts them to a sale.
- **Sale:** converts a hold, or takes available stock directly.
  - It decrements `remaining`, is idempotent per request key, and calls `touch()` so Convex and the outbox update.
  - It logs "Sold on Facebook · {name}".
  - It records the quantity only and never touches revenue (decision 3).
- No Square call is needed: catalog variations use `track_inventory: false`.
- Storefront buyers see a held or sold item as unavailable, the same way they see stock in someone's checkout.

## API

| Method and path | Purpose |
| --- | --- |
| `GET /api/stores/:id/items/:itemId/listing` | Saved kit, or 404 |
| `POST /api/stores/:id/items/:itemId/listing` | Generate or regenerate the kit (Claude, rate-limited) |
| `PATCH /api/stores/:id/items/:itemId/listing` | Seller edits to text, category, condition, crop, and the listed status/URL |
| `GET /api/stores/:id/items/:itemId/listing-photo` | Cropped, metadata-free JPEG. Owner-only until the item is published, matching `publishedPhoto` |
| `POST /api/stores/:id/items/:itemId/facebook-hold` | `{ quantity, requestKey }` places a hold |
| `DELETE /api/stores/:id/items/:itemId/facebook-hold` | Releases the hold |
| `POST /api/stores/:id/items/:itemId/sold-elsewhere` | `{ quantity, requestKey }` records a Facebook sale, using any hold first |

All routes use the existing `auth(req, id)` ownership check. The item must belong to that store. Item IDs contain `:`, so encode them in URLs.

## Data (SQLite)

- `listing_kits (item_id PK REFERENCES items(id), store_id, data, updated_at)`. `data` holds the copy, crop, and `facebook: { status, url?, listedAt? }`.
- `facebook_holds (item_id PK REFERENCES items(id), store_id, quantity, request_key, created_at)`.
- `offline_sales (request_key PK, store_id, item_id, quantity, at)`.
- `deleteStore` removes all three. Extend the deletion-completeness test.

## Native app

- New `mobile/components/listing-kit.tsx`, so `App.tsx` (about 2,700 lines) doesn't grow further.
- Add `expo-media-library` to save photos, with an add-only photo permission string in `app.config.ts`. This is a new native module, so the feature needs a **new EAS build**; the current TestFlight binary won't have it. Clipboard and Linking are already installed.

## Tests (Vitest, external services mocked at the boundary)

- **Kit generation:**
  - Requires the store owner. Other sellers and the password seller get 403.
  - Kit price always equals the SQLite price. Model text with another amount is rejected.
  - Output containing a URL, phone number, or email is rejected.
  - `Check condition` is blocked.
  - Malformed model output returns 502 with a clear message. A missing key returns 503.
  - The rate limit applies per seller.
- **Photo:**
  - The box is clamped to image bounds.
  - Output carries no EXIF/GPS.
  - Photos of unpublished items aren't public.
  - Items without a box fall back to the whole photo.
- **Holds and sales:**
  - A hold lowers storefront availability.
  - A storefront checkout can't buy held stock.
  - A hold can't take stock in an open checkout.
  - Release restores availability.
  - A sale converts the hold.
  - Requests are idempotent per key.
  - Revision and outbox are bumped.
  - Revenue is unchanged.
  - Deleted store returns 404.
- **Deletion:** removing a storefront deletes its kits, holds, and offline sales.
- **Checks:** then, per CLAUDE.md, run `npm test`, `npm run typecheck`, `npm run build`, and, in `mobile/`, `npm run typecheck` and `npm run export`.

Manual checks: paste a kit into the real Marketplace form on iOS and Android to confirm field labels, the photo limit, and the condition and category names. Record the results in `docs/VALIDATION.md`.

## Build order

1. Add `box` to the vision schema and `DraftItem`, plus the listing-photo crop endpoint.
2. Add `listing_kits`, kit generation and editing, and tests.
3. Add Facebook holds and `sold-elsewhere`, wire them into `snapshot()`/`reserve()`, add the "mark sold on Facebook" reminder, and tests.
4. Build the native item sheet and listing kit, and add `expo-media-library` (needs a new EAS build).
5. Bring the `/studio` web version to parity.
6. Update the README operating scope (Facebook sales are recorded manually) and `docs/VALIDATION.md`.

Rough size: about 3 focused days.

## Considered and deferred

- **Posting to a Facebook Page through the Meta Graph API.**
  - This would use `/{page-id}/photos` plus `/{page-id}/feed` and needs `pages_manage_posts`, App Review, and Business Verification.
  - It creates a Page post, not a Marketplace listing, so it doesn't serve personal Marketplace sellers (decision 1).
- **Per-item storefront links and Open Graph previews.** These would only matter if posts linked to the storefront (decision 2).
- **Facebook/Instagram Shops catalog.** It needs Commerce Manager, domain verification, and website checkout. It is a separate product.

## Not doing

- Scripting or automating facebook.com, or unofficial Marketplace endpoints. They break Meta's terms and the "real services only" rule.
- Group posting. The Groups API was removed in 2024 (Graph v19).
- Generated or "enhanced" product imagery.
- Claiming Meta sponsor eligibility. Meta isn't in `docs/SPONSOR-TRACKS.md`.

## Sources

- [Meta Commerce Platform: partner integration](https://developers.facebook.com/documentation/ads-commerce/commerce-platform/partners.md)
- [Meta Content Library API: Facebook Marketplace](https://developers.facebook.com/docs/content-library-and-api/content-library-api/guides/fb-marketplace)
- [Facebook Marketplace API alternatives (SociaVault)](https://sociavault.com/blog/facebook-marketplace-api-alternative)
- [Meta Graph API: Page photos](https://developers.facebook.com/docs/graph-api/reference/page/photos)
- [Graph API v19 Groups API deprecation thread](https://developers.facebook.com/community/threads/2076398286093257/)
- [Meta phases out Shops checkout (PPC Land)](https://ppc.land/meta-phases-out-facebook-and-instagram-shops-checkout-by-august-2025/)
