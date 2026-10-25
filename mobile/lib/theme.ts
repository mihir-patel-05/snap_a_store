// Shared design tokens for the native seller app.
// Palette is unchanged from the original design; the type scale follows the
// iOS Dynamic Type "Large (default)" table so text stays legible without
// losing the serif-and-italic voice of the storefront.
export const C = {
  paper: "#f8f7f1",
  ink: "#193d33",
  // Secondary text. Darkened one step from #77816f so 13–16 pt copy clears
  // 4.5:1 on paper (4.84:1) and on the sage tint (4.36:1 at 15 pt+ semibold / 3:1).
  muted: "#66705e",
  line: "#e1e5d8",
  green: "#214c3e",
  lime: "#d9ef9b",
  orange: "#df805e",
  white: "#fffefa",
  danger: "#8b3d28",
  // Tinted surfaces and accents that were previously inline literals.
  sage: "#e9eddf",
  sageLine: "#d9dfcb",
  moss: "#778b60", // the italic accent, kept exactly as before
  leaf: "#73925c", // "ready" / live indicator
  quiet: "#a6ac99", // inactive dots and chevrons (non-text)
  errorBg: "#f8e4d8",
  errorInk: "#913e2b",
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
