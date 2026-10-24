# Snap-a-Store (Cal Hacks 13.0)

Snap a photo of items on a table → Claude names and prices them → each item becomes a
Visa Pay by Link checkout shown as a QR code → Visa's webhook marks it sold.

Stack: Next.js App Router + TypeScript, zod, Anthropic SDK, @visaacceptance/agent-toolkit,
qrcode, SQLite (better-sqlite3), server-sent events. Payments: Visa Acceptance Pay by Link
(sandbox) ONLY. No other payment processor.

## Ground rules (every agent)
- Your brief is `docs/agents/<your-name>.md`. Only edit the folders it lists.
- `lib/contracts.ts`, `lib/mocks.ts`, `lib/repo.ts`, `CLAUDE.md` and `docs/` are owned by the
  lead. Never edit them. If you need a change, write it in your NOTES file (below) and keep
  going with a local workaround inside your own folders.
- Never commit secrets. Keys come from environment variables only.
- Default to `VISA_MODE=mock` unless your milestone says sandbox.

## Working unattended
You may be running for hours with nobody watching. So:
- Work through your milestones in order. Don't stop to ask questions; make the most
  reasonable choice, and record it in your NOTES file.
- After every milestone: `npm run typecheck && npm test`, then commit and push your branch.
- Keep a running log in your NOTES file (path in your brief): what's done, decisions made,
  anything blocked, contract changes you need. Newest entry first, timestamp each one.
- If something is blocked (missing key, API not enabled, contract gap): log it, build a
  mock or stub for it inside your own folders, and move to the next milestone.
- Never install a dependency you don't need. Add tests next to your code.

## Shared interfaces (from lib/contracts.ts and lib/repo.ts)
- Types: `ItemStatus` ("draft" | "live" | "sold"), `DraftItem`, `Item`, `Store`, `StoreEvent`.
- Data access: `import { repo } from "@/lib/repo"`. It returns an in-memory mock until the
  `store` agent's SQLite version is merged; the interface is identical:
  ```ts
  interface StoreRepo {
    createStore(name: string): Store;
    getStore(storeId: string): Store | undefined;
    getItems(storeId: string): Item[];
    saveItems(items: Item[]): void;                 // insert or update by id
    setStatus(itemId: string, status: ItemStatus): Item;
    findByLinkId(linkId: string): Item | undefined;
    subscribe(storeId: string, fn: (e: StoreEvent) => void): () => void; // returns unsubscribe
  }
  // StoreEvent = { type: "snapshot"; items: Item[] } | { type: "item.updated"; item: Item }
  ```

## Routes (the only cross-agent API)
| Route | Owner | Takes | Returns |
| --- | --- | --- | --- |
| POST /api/scan | vision | multipart form, field `photo` | `{ items: DraftItem[] }` |
| POST /api/publish | visa | `{ storeId, items: { name, price }[] }` | `{ items: Item[] }` (status `live`, `paymentUrl` set) |
| POST /api/webhooks/visa | visa | Visa `payByLink.merchant.payment` event | 200; item → `sold`, link → `INACTIVE` |
| GET /api/events?storeId= | store | — | SSE: one `snapshot`, then `item.updated` per change |

## Commands
- `PORT=<your port> npm run dev` — ports: vision 3001, visa 3002, store 3003,
  seller-ui 3004, storefront 3005, merchant-agent 3006
- `npm run typecheck`, `npm test`, `npm run smoke` (smoke is the lead's)

## Environment variables
ANTHROPIC_API_KEY, VISA_ACCEPTANCE_MERCHANT_ID, VISA_ACCEPTANCE_API_KEY_ID,
VISA_ACCEPTANCE_SECRET_KEY, VISA_MODE (mock | sandbox), PUBLIC_BASE_URL
