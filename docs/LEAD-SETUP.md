# Lead setup (after 6 p.m. Friday, ~30 min)

> Steps 1–4 are already done in this repo: the Next.js skeleton, dependencies and scripts in
> `package.json`, these docs, the shared `lib/` files, `.gitignore` and `.worktreeinclude` are
> all on `main`. There is no `package-lock.json` yet: the first person to run `npm install`
> should run `npm run typecheck`, then commit and push the lockfile so everyone gets the same
> versions. Then continue from step 5.
>
> There is deliberately no `app/page.tsx`: the seller-ui agent owns `/` through `app/(seller)/`,
> and two files for the same route would break the build.

1. Create the app:
   ```bash
   npx create-next-app@latest snap-a-store --ts --app --eslint
   cd snap-a-store
   npm i zod @anthropic-ai/sdk @visaacceptance/agent-toolkit qrcode better-sqlite3
   npm i -D vitest @types/qrcode @types/better-sqlite3
   ```
2. Copy everything from this folder into the repo root, keeping paths:
   `CLAUDE.md`, `docs/agents/*.md`, `lib/contracts.ts`, `lib/mocks.ts`, `lib/repo.ts`,
   `.claude/agents/merge-reviewer.md`, and this file plus `STARTER-PROMPTS.md` (put those two in `docs/`).
3. Add scripts to `package.json`:
   ```json
   "typecheck": "tsc --noEmit",
   "test": "vitest run",
   "eval:vision": "tsx scripts/eval-vision.ts",
   "smoke": "tsx scripts/smoke.ts"
   ```
   (`npm i -D tsx` for the two script commands.)
4. Ignore files and carry keys into worktrees:
   ```bash
   printf ".claude/worktrees/\n.env.local\ndata/\n" >> .gitignore
   echo ".env.local" > .worktreeinclude
   ```
5. Create `.env.local` with ANTHROPIC_API_KEY, the three VISA_ACCEPTANCE_* keys,
   `VISA_MODE=mock`, and `PUBLIC_BASE_URL` (your tunnel URL, later).
6. `npm run typecheck` must pass, then commit and push `main`. Agents branch from GitHub,
   so nothing unpushed reaches them.
7. Launch agents with the prompts in `STARTER-PROMPTS.md`.

## At merge time
- Switch `lib/repo.ts` to `sqliteRepo` only after `lib/db/repo.contract.test.ts` passes.
- Read every `NOTES.md` for contract-change requests before merging that branch.
- Merge order: store → visa → vision → seller-ui → storefront → merchant-agent.
