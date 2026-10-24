# Brief: visa agent

You own everything that touches Visa: turning confirmed items into Visa Acceptance
Pay by Link checkouts, and turning Visa's payment webhook into "sold". This is the piece
the Visa judges care most about, so the sandbox path must really work, not just the mock.

## You own (only edit these)
- `lib/visa/`
- `app/api/publish/`
- `app/api/webhooks/visa/`
- `scripts/visa-*`
- NOTES file: `lib/visa/NOTES.md`

## You build against
- `Item`, `ItemStatus` from `lib/contracts.ts`
- `repo` from `@/lib/repo` (in-memory mock until the store agent's version merges)
- Routes:
  - `POST /api/publish` takes `{ storeId, items: { name, price }[] }`, returns `{ items: Item[] }`
    with each item `live` and `paymentUrl` + `linkId` set
  - `POST /api/webhooks/visa` takes Visa's `payByLink.merchant.payment` event, returns 200,
    sets the item `sold` and its link `INACTIVE`

## Visa facts you'll need
- Sandbox create endpoint: `POST https://apitest.visaacceptance.com/ipl/v2/payment-links/`
  - Required: `processingInformation.linkType = "PURCHASE"`, `purchaseInformation.purchaseNumber`
    (unique per link; use the item id), `orderInformation.amountDetails.currency = "USD"`,
    `orderInformation.amountDetails.totalAmount`, `orderInformation.lineItems[].productName`,
    `orderInformation.lineItems[].unitPrice`
  - Response: `id`, `status`, and `purchaseInformation.paymentLink` (the checkout URL)
- Update: `PATCH .../ipl/v2/payment-links/{id}`. An update must resend ALL fields from the
  original create, or the missing ones are removed. Set `status: "INACTIVE"` to close a link.
- Links are reusable (every payment is a new transaction), which is why a sold one-of-a-kind
  item must be deactivated.
- Pay by Link fields must never carry personal data (no buyer names, emails, addresses).
- Agent Toolkit: `@visaacceptance/agent-toolkit`, configured with
  `VISA_ACCEPTANCE_MERCHANT_ID`, `VISA_ACCEPTANCE_API_KEY_ID`, `VISA_ACCEPTANCE_SECRET_KEY`,
  and `configuration.context.environment = "SANDBOX"`. It exposes payment-link create,
  update, list and get. Prefer it over hand-signed requests. If it can't set `status`,
  fall back to a signed REST PATCH (Visa Acceptance HTTP signature auth) and note it.
- Webhook event type: `payByLink.merchant.payment`. Subscriptions need a public HTTPS URL
  (`PUBLIC_BASE_URL` + `/api/webhooks/visa`). A newly created subscription may come back
  `INACTIVE`; check its status.

## Milestones (in order; commit + push after each)
1. **One interface, two clients.** `lib/visa/client.ts` exports
   `createLink(item: { id; name; price }): Promise<{ linkId; paymentUrl }>`,
   `deactivateLink(linkId, original): Promise<void>`, `getLink(linkId)`.
   `VISA_MODE=mock` returns fake links (`https://example.test/pay/<id>`) from
   `lib/visa/mock.ts`; `VISA_MODE=sandbox` calls Visa. Same interface either way.
2. **Publish route.** Validate the body with `PublishRequest` from contracts. The request only
   carries `{ name, price }`, so fill the rest of each `Item` yourself: new id, `storeId`,
   `suggestedPrice = price`, `confidence = 1`, `updatedAt` now. Create one link per item (in parallel,
   with a small concurrency limit), save items through `repo.saveItems` as `live` with
   `linkId` and `paymentUrl`. If some links fail, publish the rest and return per-item errors.
3. **Webhook route.** Parse the event, find the item with `repo.findByLinkId`, set it `sold`
   with `repo.setStatus`, then `deactivateLink`. Must be idempotent: a repeated event for an
   already-sold item returns 200 and does nothing. Never 500 on a malformed payload; log and
   return 400. Save one real-looking sample payload in `lib/visa/__fixtures__/` and test
   against it. If the subscription uses a signing key, verify the signature when
   `VISA_WEBHOOK_SECRET` is set; skip with a logged warning when it isn't.
4. **Scripts.** `scripts/visa-create-test-link.ts` (creates one $1 sandbox link and prints the
   URL) and `scripts/visa-subscribe-webhook.ts` (creates the Pay by Link webhook subscription
   for `PUBLIC_BASE_URL` and prints its status). Wire both as npm scripts.
5. **Sandbox check.** If the Visa keys are present, run `visa-create-test-link` and record the
   result in NOTES. If it fails (keys missing, Pay by Link not enabled, auth error), record
   the exact error, keep everything working in mock mode, and continue. Humans will finish
   the sandbox test Saturday evening.
6. **Tests.** Mock-mode tests for publish (all succeed, partial failure) and webhook
   (sold + deactivated, duplicate event, unknown link, malformed body). No network in tests.

## Done when
All tests pass in mock mode, and in sandbox mode a test payment's webhook leaves the item
`sold` with its link `INACTIVE`. If the sandbox couldn't be reached unattended, NOTES says
exactly what a human needs to do.

## Don't
- Don't add any other payment processor.
- Don't log full API keys or secrets.
- Don't edit `lib/repo.ts`, `lib/contracts.ts` or anything outside your folders.
