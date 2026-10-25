// Shared design tokens for the native seller app.
//
// Palette: a kitchen table in afternoon light. Linen paper, espresso ink,
// worn denim for the one brand action, and brass for the italic accent, the
// way a brass lamp catches the eye among pre-loved things. Status colors are
// olive (live, ready) and clay (needs attention). Every text pairing clears
// WCAG AA against the surface it sits on; ratios are noted beside each token.
export const C = {
  paper: "#f5f1e8", // linen background
  white: "#fffdf8", // cards and inputs
  stone: "#ebe5d8", // tinted surfaces: hero, badges, store card
  stoneLine: "#ddd5c4", // borders on stone surfaces, sheet grabber
  stoneDeep: "#d8cfbb", // store avatar
  wash: "#e3e8f0", // denim wash: selected tab, open storefront row
  line: "#e0d9cb", // hairlines on paper and white
  ink: "#26231f", // espresso text, 13.9:1 on paper
  muted: "#6b655a", // secondary text, 5.1:1 on paper, 4.6:1 on stone
  denim: "#34507c", // primary action and brand, 7.2:1 on paper
  brass: "#8f6418", // the italic accent, 4.65:1 on paper
  live: "#5c7a3a", // olive: live, ready, configured
  clay: "#c2603a", // needs attention
  quiet: "#a9a195", // inactive dots and chevrons (non-text)
  danger: "#9a3b2a", // 6.1:1 on paper
  errorBg: "#f7e3d8",
  errorInk: "#8d3a26", // 6.1:1 on errorBg
};
export const F = {
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semi: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
  serif: "Fraunces_500Medium",
  italic: "Fraunces_500Medium_Italic",
};
// iOS text styles at the default size: [fontSize, lineHeight].
export const T = {
  largeTitle: { fontSize: 34, lineHeight: 41 },
  title1: { fontSize: 28, lineHeight: 34 },
  title2: { fontSize: 22, lineHeight: 28 },
  title3: { fontSize: 20, lineHeight: 25 },
  headline: { fontSize: 17, lineHeight: 22 },
  body: { fontSize: 17, lineHeight: 22 },
  callout: { fontSize: 16, lineHeight: 21 },
  subhead: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
};
export const R = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };
