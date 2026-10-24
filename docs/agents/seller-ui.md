# Brief: seller-ui agent

You build what the seller holds: a phone-first web app to snap a photo, fix the prices
Claude suggests, and publish. It is the first thing judges touch, so it must be fast,
obvious and work one-handed on a phone.

## You own (only edit these)
- `app/(seller)/` (routes: `/` landing, `/new` create store, `/store/[storeId]` dashboard)
- `components/seller/`
- NOTES file: `components/seller/NOTES.md`

## You build against
- Types from `lib/contracts.ts`
- Routes (call them over HTTP from the client; don't import other agents' code):
  - `POST /api/stores` `{ name }` → `{ store }`
  - `GET /api/stores/[id]` → `{ store, items }`
  - `POST /api/scan` multipart `photo` → `{ items: DraftItem[] }`
  - `POST /api/publish` `{ storeId, items: { name, price }[] }` → `{ items: Item[] }`
  - `GET /api/events?storeId=` SSE for live sold updates
- Until those routes exist on your branch, use `lib/mocks.ts` behind a small
  `components/seller/api.ts` client with a `NEXT_PUBLIC_USE_MOCKS=1` switch. Every network
  call goes through that file so swapping to the real routes is one flag.

## Milestones (in order; commit + push after each)
1. **Flow skeleton.** Landing → name your store → capture screen → review → published
   dashboard. Plain but working, all on mocks.
2. **Capture.** `<input type="file" accept="image/*" capture="environment">` so phones open the
   camera; also allow picking from the library. Downscale on the client to ~1600 px long edge
   before upload. Show a clear "Reading your items…" state; scans can take several seconds.
3. **Review table.** One row per item: editable name, editable price (numeric keypad,
   2-decimal), Claude's confidence shown as a subtle "check this" flag under ~0.6, delete row,
   add row manually. Totals line at the bottom. A "Scan more" button appends a second photo's
   items. Publish disabled until every row has a name and a price > 0.
4. **Dashboard.** After publish: each item with status chip (live / sold), a small QR preview,
   copy-link button, a link to the public storefront `/s/[storeId]`, and live SOLD updates
   from the SSE stream with a running "sold $X of $Y" total. Add a "Mark sold" button as a
   manual fallback, but disabled with a TODO: no route for it exists yet, so log the need in
   NOTES for the lead instead of inventing one.
5. **Polish for judges.** Works at 375 px wide, large tap targets, no layout shift, loading
   and error states for every call (scan failed, publish partially failed with per-item retry).
   Use the `qrcode` package to render QR images client-side from `paymentUrl`.
6. **Tests.** Component tests for the review table (edit, delete, validation, totals) and
   the api client's mock switch.

## Done when
On a phone browser with mocks on: photo → edit → publish → dashboard works end to end, and
flipping `NEXT_PUBLIC_USE_MOCKS=0` uses the real routes without code changes.

## Don't
- Don't build the public storefront board; that's the storefront agent.
- Don't add a component library heavier than what's already installed. Plain CSS modules or
  Tailwind if the repo has it.
