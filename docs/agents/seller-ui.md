# Brief: seller-ui agent (Expo / React Native)

You build the app the seller holds: a React Native app built with Expo that runs on a real
iPhone in **Expo Go, with no Xcode build**, and that can still be built natively later
(`npx expo run:ios`) without code changes. Snap a photo, fix the prices Claude suggests,
publish, and watch items sell. It's the first thing judges touch, so it must be fast,
obvious, and work one-handed.

The public big-screen board stays a web page (storefront agent). Don't build anything under
`app/`.

## You own (only edit these)
- `mobile/` (the whole Expo app)
- NOTES file: `mobile/NOTES.md`

## Dependency rules (most important)
- Create the app with `npx create-expo-app@latest mobile` using the default TypeScript
  template with Expo Router. `mobile/` has its **own** `package.json` and `node_modules`.
  Never make it a workspace of the root package and never install mobile packages at the
  repo root: the Next.js app and the Expo app must never share React or React Native.
- Add every package with `npx expo install <pkg>`, not plain `npm install`, so versions
  match the Expo SDK.
- Only use modules that work in Expo Go: core React Native plus standard Expo modules
  (`expo-router`, `expo-camera` or `expo-image-picker`, `expo-image-manipulator`,
  `expo-web-browser`, `expo-haptics`, `expo-clipboard`, `expo-sharing`, `react-native-svg`,
  `react-native-safe-area-context`, `react-native-gesture-handler`,
  `react-native-reanimated`). No custom native modules, nothing that needs a development
  build, and don't commit `ios/` or `android/` folders from `expo prebuild`.
- QR codes: `react-native-qrcode-svg` (pure JS on top of `react-native-svg`).
- After every dependency change run `npx expo-doctor` and fix everything it reports.
- Don't import from the root `lib/`. Copy the types you need from `lib/contracts.ts` into
  `mobile/src/contracts.ts` (TypeScript types only, no zod), keep the shapes identical, and
  note the copy in NOTES so the lead can keep them in sync.

## Backend
- Every network call goes through `mobile/src/api.ts`. Base URL comes from
  `EXPO_PUBLIC_API_URL`.
- `EXPO_PUBLIC_USE_MOCKS=1` (the default) returns mock data from `mobile/src/mocks.ts` with
  realistic delays and never touches the network. Mock store: "Maya's Garage Sale" with Blue
  ceramic mug $4, Paperback novels (x6) $6, Brass desk lamp $15, Wireless headphones (brand
  unclear) $20 at low confidence, Vintage film camera $35, Wool throw blanket $12, Board game
  $10, Succulent in clay pot $5.
- Real routes (see `CLAUDE.md`):
  - `POST /api/stores` `{ name }` → `{ store }`
  - `GET /api/stores/[id]` → `{ store, items }`
  - `POST /api/scan` multipart field `photo` → `{ items: DraftItem[] }`
  - `POST /api/publish` `{ storeId, items: { name, price }[] }` → `{ items: Item[] }`
  - `GET /api/events?storeId=` SSE for live sold updates
- React Native has no built-in `EventSource`: use `react-native-sse` (pure JS), or fall back
  to polling `GET /api/stores/[id]` every 3 s, behind the same `api.ts` interface.
- A phone can't reach `localhost` on a laptop. `EXPO_PUBLIC_API_URL` will be the lead's
  tunnel URL; never hardcode a host.

## Screens (Expo Router, iOS conventions)
Respect safe areas (notch, home indicator), 44 pt minimum tap targets, light and dark mode,
Dynamic Type friendly. No hover or web-only patterns.
1. **Welcome:** one-line pitch, "Start selling".
2. **Name your store:** one text field, Continue.
3. **Capture:** camera view with a large shutter button plus "Choose from library". Resize to
   ~1600 px long edge with `expo-image-manipulator` before upload. Handle camera permission
   denied with a clear way to use the library instead.
4. **Scanning:** photo thumbnail and "Reading your items…". Scans can take several seconds.
5. **Review:** one row per item with editable name and price (decimal keypad), a "check this"
   flag when confidence < 0.6, swipe or button to delete, "Add item", "Scan more" (appends a
   second photo's items), total, and a sticky "Publish N items" button above the home
   indicator, disabled until every row has a name and a price > 0.
6. **Dashboard:** store name, "Sold $X of $Y" progress, items with live/sold status chips, QR
   thumbnail and share button per item, and "Open public board" (opens
   `{EXPO_PUBLIC_API_URL}/s/{storeId}` with `expo-web-browser`).
7. **Item detail sheet:** large QR to show a buyer face to face, price, copy and share link.
   A "Mark as sold (cash)" button stays disabled with a TODO: no route for it exists yet, so
   log the need in NOTES for the lead instead of inventing one.
8. **SOLD moment:** banner plus haptic when an item turns sold.
9. **Errors:** scan failed, partial publish with per-item retry, offline.

Show Visa only as text ("Pay with Visa", "Secure checkout by Visa"). No logos.

## Milestones (in order; commit + push after each)
1. Scaffold, `expo-doctor` clean, navigation between empty screens.
2. Mock `api.ts` and `mocks.ts`; full flow 1 → 6 working on mocks.
3. Camera, image resize, review editing and validation.
4. Dashboard, QR codes, item sheet, live sold updates (with `EXPO_PUBLIC_DEMO=1` the mock
   marks a random item sold every ~20 s).
5. Real API path in `api.ts` (still defaulting to mocks), error and offline states.
6. Polish: dark mode, Dynamic Type, haptics, empty states.

## Checks (all must pass before every push)
The root `npm run typecheck && npm test` doesn't cover `mobile/`. Run these instead:
- `cd mobile && npx expo-doctor`
- `cd mobile && npx tsc --noEmit`
- `cd mobile && npx jest` (use `jest-expo`; test the `api.ts` mock switch, review validation
  and totals)
- `cd mobile && npx expo export --platform ios` (proves the iOS bundle builds without any
  native toolchain)

## Done when
All four checks pass, the full flow works on mocks, and `mobile/NOTES.md` ends with exact
steps for a teammate to run it on an iPhone with Expo Go (`cd mobile && npm install &&
npx expo start`, scan the QR with Expo Go; `--tunnel` if the phone and laptop aren't on the
same network).

## Don't
- Don't build the public storefront board; that's the storefront agent (web).
- Don't edit anything outside `mobile/`, including root `package.json`, `tsconfig.json`,
  `lib/`, `docs/` or `CLAUDE.md`.
