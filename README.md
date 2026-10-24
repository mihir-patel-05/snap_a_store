# snap_a_store

Cal Hacks 13.0 project. Snap a photo of items on a table, Claude names and prices them,
each item becomes a Visa Pay by Link checkout shown as a QR code, and Visa's webhook
marks it sold.

## Get started
```bash
npm install
cp .env.example .env.local   # fill in your keys
npm run typecheck
```

## Building with agents
- Project rules for every agent: `CLAUDE.md`
- One brief per agent: `docs/agents/`
- Prompts to paste into each agent's session: `docs/STARTER-PROMPTS.md`
- Lead checklist and merge order: `docs/LEAD-SETUP.md`

Launch an agent locally with `claude --worktree <agent-name>`, then `npm install` inside it.
