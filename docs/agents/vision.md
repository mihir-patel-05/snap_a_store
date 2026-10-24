# Brief: vision agent

You turn a photo of items on a table into a priced list. Sellers trust these names and
prices enough to publish them, so they must be specific ("blue ceramic mug", not "item")
and the prices must be plausible for a garage sale or flea market.

## You own (only edit these)
- `lib/vision/`
- `app/api/scan/`
- `fixtures/photos/`
- `scripts/eval-vision.ts`
- NOTES file: `lib/vision/NOTES.md`

## You build against
- `DraftItem` from `lib/contracts.ts`: `{ name: string; suggestedPrice: number /* USD */; confidence: number /* 0-1 */ }`
- Route contract: `POST /api/scan`, multipart field `photo` → `{ items: DraftItem[] }`

## Milestones (in order; commit + push after each)
1. **Vision call.** `lib/vision/scan.ts` exports `scanPhoto(image: Buffer, mimeType: string): Promise<DraftItem[]>`.
   Use the Anthropic SDK with model `claude-sonnet-5-5`. Force structured output (tool use
   with a JSON schema, or equivalent) and validate the result with the `DraftItem` zod
   schema. Retry once on invalid output; then throw a typed error.
2. **Prompt quality.** Keep the prompt in `lib/vision/prompt.ts`. It should: list every
   distinct sellable item (group identical items as one entry with a count in the name,
   e.g. "Paperback novels (x6)"), price in whole or half dollars for a second-hand sale,
   lower `confidence` for blurry, partial or brand-unclear items, and ignore people,
   furniture the items sit on, and background.
3. **Route.** `app/api/scan/route.ts`: accept the multipart upload, reject non-images and
   files over 10 MB with a 400 and a clear message, resize large images before sending
   (keep the long edge ≤ 1568 px), return `{ items }`. Add a `VISION_MODE=mock` path that
   returns a fixed list from `lib/vision/fixtures.ts` so the UIs can run without a key.
4. **Tests.** Unit-test the parser and validation against recorded sample model responses
   (save them in `lib/vision/__fixtures__/`). Tests must not call the API.
5. **Eval harness.** `scripts/eval-vision.ts` (wire as `npm run eval:vision`): for every image
   in `fixtures/photos/` with a matching `<name>.expected.json`, call `scanPhoto` and report
   item count, which expected items were found (fuzzy name match), and price within ±50%.
   Humans will add real photos Saturday evening; until then, make it run cleanly on an
   empty folder and on any images already present.
6. **Speed.** Measure latency on whatever photos exist. If a call takes over ~8 s, try a
   smaller image size first, then note results in NOTES.

## Done when
`npm test` passes without network, `POST /api/scan` returns schema-valid items for a real
photo, and `npm run eval:vision` runs end to end.

## Don't
- Don't edit anything outside your folders, including `lib/contracts.ts`.
- Don't add a database or call other agents' routes.
