# Snap-a-Store: current implementation

The user's current direction is **Expo for iOS and Android**, Claude vision, **Square** catalog/checkout, and useful sponsor integrations. This supersedes the earlier Visa-only scaffold. Historical briefs in `docs/agents/` and the old lead prompts are context, not the current implementation contract.

- Backend and buyer storefront: Next.js + TypeScript, Zod, SQLite WAL.
- Native seller: Expo SDK 58 in `mobile/`.
- Sponsor features: Apify price evidence, Cartesia narration, Convex realtime snapshots.
- Never invent live API success, sold prices, environmental metrics, or prize eligibility.
- The user requires real services only. Do not add sample catalogs, simulated payment endpoints, or fabricated recognition. Missing credentials must fail clearly. Square production is the default; sandbox is an explicit integration-test environment.
- One merchant per deployment. Require the configured seller login before managing inventory or spending provider credits. Keys stay on the server. Native seller tokens use SecureStore. Never commit `.env.local`.
- Preserve seller authorization, upload limits, webhook validation, transactional reservations, stable idempotency keys, and exact payment totals.
- SQLite is authoritative; use a single persistent backend instance. Convex is a realtime projection with a durable retry queue.
- Use Node 22.13+. Run relevant tests, root typecheck/build, native typecheck/export after changes to their paths.
- Do not push, deploy, or distribute signed binaries merely because this file mentions a workflow.

See README.md, docs/SPONSOR-TRACKS.md, and docs/VALIDATION.md.
