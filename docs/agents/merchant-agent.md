# Brief: merchant-agent (STRETCH — start only after the five core agents pass their done-when checks)

You let the seller manage their live store by chatting with Claude: "take 20% off the mugs",
"what's sold so far?", "close the link for the lamp, I sold it in cash". Claude acts through
Visa's Agent Toolkit. This is the line that ties the Visa track to the Claude track.

## You own (only edit these)
- `app/api/agent/`
- `components/agent-chat/`
- `lib/agent/`
- NOTES file: `lib/agent/NOTES.md`

## You build against
- `repo` from `@/lib/repo`, types from `lib/contracts.ts`
- `lib/visa/client.ts` from the visa agent (import it; don't modify it). If you need a
  function it lacks, log the request in NOTES.
- `@visaacceptance/agent-toolkit` payment-link tools (create, update, list, get), sandbox env

## Milestones (in order; commit + push after each)
1. **Tool loop.** `POST /api/agent` `{ storeId, messages }` runs a Claude tool-use loop
   (Anthropic SDK, `claude-sonnet-5-5`) with tools: `list_items`, `update_price(itemId, price)`,
   `mark_sold(itemId)`, `store_summary()`. Each tool goes through `repo` plus the visa client,
   so a price change updates the item AND its Visa link (resending all original fields).
2. **Safety rails.** Confirm before bulk changes (more than 3 items or any price cut > 50%):
   the model must reply with a summary and wait for "yes". Never create links for items the
   seller didn't publish. Never put buyer personal data in any Visa field.
3. **Chat UI.** `components/agent-chat/ChatPanel.tsx`: a compact panel the lead can mount on
   the seller dashboard; streaming replies; shows each action taken as a small receipt line
   ("Mug: $8 → $6.40, Visa link updated").
4. **Tests.** Tool functions in mock mode (price update changes repo and calls the mock visa
   client; bulk-change confirmation path).

## Done when
In mock mode, "take 20% off everything" asks for confirmation, then updates every live item
and its link, and the storefront board shows the new prices live.
