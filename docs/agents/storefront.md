# Brief: storefront agent

You build the public board buyers see: a big-screen page of item tiles, each with a QR code
that opens Visa checkout, flipping to SOLD live when a payment lands. This is the demo's
money shot, so the SOLD flip must be instant and impossible to miss from across a room.

## You own (only edit these)
- `app/s/[storeId]/` (board) and `app/s/[storeId]/print/` (printable QR cards)
- `components/storefront/`
- NOTES file: `components/storefront/NOTES.md`

## You build against
- Types from `lib/contracts.ts`
- `GET /api/stores/[id]` → `{ store, items }` for the first render
- `GET /api/events?storeId=` SSE: one `snapshot`, then `item.updated` per change
- Until those exist on your branch, use `lib/mocks.ts` behind `components/storefront/api.ts`
  with `NEXT_PUBLIC_USE_MOCKS=1`, plus a dev-only "simulate sale" button (hidden unless
  `?demo=1`) that flips a random live item to sold so you can build the animation.

## Milestones (in order; commit + push after each)
1. **Board.** Store name header, a responsive grid of tiles: item name, price, QR code
   (rendered client-side from `paymentUrl` with the `qrcode` package, high error correction,
   large enough to scan from ~2 m on a laptop or TV screen). Only `live` and `sold` items show.
2. **Live updates.** Subscribe to SSE with `EventSource`; apply `snapshot` and
   `item.updated`; auto-reconnect with backoff; show a small "live" dot that goes grey when
   disconnected. New items published while the page is open appear without reload.
3. **SOLD moment.** When an item turns sold: the tile flips/overlays a bold SOLD stamp, the
   QR is hidden (that link is closed), and a short toast reads "<item> just sold — $<price>".
   Keep sold tiles visible, moved to the end. Respect `prefers-reduced-motion`.
4. **Header stats.** "<n> of <m> sold · $<sold total> raised", updating live. A "Pay with Visa"
   line under the title so the Visa branding is clear (text only; no copied logos).
5. **Print view.** `/s/[storeId]/print`: one card per live item (name, price, QR, short URL),
   sized to print 6 per Letter page, so sellers can tape QR cards next to items.
6. **Tests.** Reducer tests for applying snapshot/update events (including out-of-order and
   duplicate updates), and a render test that a sold item hides its QR.

## Done when
With mocks: tiles render, `?demo=1` sale flips a tile to SOLD instantly, stats update.
With real routes: a sandbox payment flips the matching tile within a couple of seconds, and
scanning any QR on screen opens Visa's hosted checkout.

## Don't
- Don't build seller-facing editing; that's seller-ui.
- Don't poll; use the SSE stream.
