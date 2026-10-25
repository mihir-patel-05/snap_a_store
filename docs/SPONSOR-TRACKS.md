# Cal Hacks 13.0: meaningful integrations and verification

Checked against the [official Devpost prize listing](https://cal-hacks-13-0.devpost.com/) on October 24, 2026. The supplied Slack screenshots identify sponsor channels, not eligibility rules. Confirm full challenge requirements with each sponsor before submitting. API adapters in code are not enough: demonstrate successful calls in your own configured account.

| Candidate                                          | Product contribution                                                                     | What to show judges                                                                                                              | Current verification                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **[Apify] Best use of Apify**                      | Claude prices identifiable items from the eBay listings Apify finds during each scan     | Scan a branded item, open Why this price?, show the actor run and trace a matched listing to its source                          | Adapter, scan research, and result validation implemented; token/live actor run needed         |
| **[Cartesia] Best Use of Cartesia**                | Accessible audio browsing that reflects actual inventory, with English/Spanish narration | Listen to the shop, buy the last item, then show narration no longer offers it                                                   | API adapter and UI implemented; voice/key/live audio needed                                    |
| **[Convex] Best use of Convex**                    | Inventory changes pushed to sellers and buyers across devices                            | Keep seller and buyer views open; complete a payment and show the last item disappear, with the Convex subscription and mutation | Schema, authenticated mutation, subscriptions, and retry outbox implemented; deployment needed |
| **Cal Hacks Best Planet-First Social Impact Hack** | Makes reuse and neighborhood resale easier                                               | Demonstrate actual items finding new homes; do not invent carbon-savings numbers                                                 | Product fit, not a claim of eligibility or environmental measurement                           |
| **Cal Hacks Best People-First Social Impact Hack** | Low-friction selling and spoken product access                                           | Show nontechnical seller flow, transparent estimates, accessible buyer page                                                      | Product fit; user research and a working demo strengthen the case                              |
| **Overall / creativity / technical categories**    | One coherent native seller → shared storefront → inventory-safe payment story            | Show the complete happy path and a competing checkout safely losing the final item                                               | Live API paths and automated correctness tests implemented; account verification required                                          |

Claude powers the core image workflow. Square powers the requested catalog and checkout. They are useful product choices, but this report does not assert a dedicated listed Square or Claude prize. Passing a Visa-branded card through Square does **not** count as a Visa API integration. Likewise, a regular Elastic index would not establish use of the specifically listed Elastic **Agent Builder on Serverless** track. Coinbase x402 is not relevant to a physical-goods card checkout without a separate paid machine-readable service. These were deliberately not represented as implemented integrations.

## 90-second walkthrough

1. **0–15s:** Put a mug, a lamp, and books on a real table. “There is a tiny business hiding here.” Capture it in the Expo app.
2. **15–35s:** Review Claude's names, uncertainty, prices, and counts. Open Why this price? on a branded item, show the matched Apify listings, and explain why asking prices are evidence, not truth. Edit one price.
3. **35–50s:** Publish. Show Square catalog variations in your configured dashboard. Hold up the app's QR code.
4. **50–70s:** A second phone opens the storefront. Listen with Cartesia, add the unique lamp to the bag, and complete an authorized Square purchase.
5. **70–85s:** The seller app and another buyer view update through Convex. The lamp is sold out. A stale competing checkout is rejected.
6. **85–90s:** “One photo, one neighborhood store, one more chance for good things.”

If keys are unavailable, configure them before presenting the service as working. There is no simulated fallback in the app. Never present polling or device speech as a sponsor API call.

## Primary implementation references

- [Claude models and vision capabilities](https://platform.claude.com/docs/en/models/overview)
- [Square CreatePaymentLink](https://developer.squareup.com/reference/square/checkout/create-payment-link)
- [Square webhook signature validation](https://developer.squareup.com/docs/webhooks/step3validate)
- [Square payment-link cancellation](https://developer.squareup.com/reference/square/checkout/delete-payment-link)
- [Apify synchronous actor API](https://docs.apify.com/api/v2/actor-run-sync-get-dataset-items-post)
- [Configured eBay actor](https://apify.com/ninhothedev/ebay-scraper)
- [Cartesia speech bytes API](https://docs.cartesia.ai/api-reference/tts/bytes)
- [Convex HTTP client](https://docs.convex.dev/api/classes/browser.ConvexHttpClient.html)
- [Expo image picker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
