# Brief: store agent

You own the data layer and the live event stream. Every other agent reads and writes items
through the `StoreRepo` interface in `lib/repo.ts`; your job is the real SQLite version of
that interface plus the SSE route the storefront board listens to.

## You own (only edit these)
- `lib/db/`
- `app/api/events/`
- `app/api/stores/` (small helper routes, see milestone 4)
- NOTES file: `lib/db/NOTES.md`

## You build against
- `Item`, `ItemStatus`, `Store`, `StoreEvent` from `lib/contracts.ts`
- The `StoreRepo` interface in `CLAUDE.md` / `lib/repo.ts`. Match it exactly.
- `lib/repo.ts` is the lead's. It exports the in-memory mock today. The lead will switch
  it to your implementation at merge time with a one-line change, so export yours as
  `sqliteRepo` from `lib/db/index.ts` and don't touch `lib/repo.ts`.

## Milestones (in order; commit + push after each)
1. **Schema + repo.** `better-sqlite3`, DB file from `DATABASE_PATH` (default
   `./data/snap.db`, create the folder; add `data/` to a `.gitignore` inside `lib/db/` notes
   for the lead if needed). Tables: `stores(id, name, created_at)` and
   `items(id, store_id, name, suggested_price, confidence, price, status, link_id, payment_url, updated_at)`.
   Implement every `StoreRepo` method. Validate rows coming out with the zod schemas.
2. **Status rules.** Enforce `draft → live → sold`. `setStatus` to `sold` on an item that is
   already `sold` is a no-op that returns the item (the webhook relies on this). Any other
   backward move throws a typed error.
3. **Events.** An in-process event bus: every `saveItems` and `setStatus` emits
   `{ type: "item.updated", item }` to that store's subscribers. `subscribe` returns an
   unsubscribe function and never leaks listeners.
4. **Routes.**
   - `GET /api/events?storeId=` : SSE. On connect send one `snapshot` event with all items,
     then one `item.updated` per change. Send a comment heartbeat every 15 s so proxies and
     tunnels keep the connection open. Clean up the subscription when the client disconnects.
     Set `export const dynamic = "force-dynamic"` and run on the Node runtime.
   - `POST /api/stores` `{ name }` → `{ store }`, and `GET /api/stores/[id]` → `{ store, items }`.
     The seller UI uses these to create a store and load it.
5. **Tests.** Repo tests against a temp DB file: create, save/update by id, status rules,
   `findByLinkId`, subscribe/unsubscribe. A test that the SSE route emits `snapshot` then an
   `item.updated` after a `setStatus`.
6. **Contract test for everyone.** Add `lib/db/repo.contract.test.ts` that runs the same suite
   against both the mock (`lib/mocks.ts` repo) and `sqliteRepo`, so the lead can prove they
   behave the same before switching.

## Done when
`npm test` passes, including the contract test against both implementations, and
`curl -N "localhost:3003/api/events?storeId=<id>"` shows a snapshot then live updates.

## Notes
- The demo runs as one long-lived `next start` process, so an in-process event bus is fine.
  Don't add Redis or any external service.
