import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { C, F, T } from "../lib/theme";

const APPLE_LOGO =
  "M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z";

// Compact round Google and Apple buttons under a hairline "or" divider.
export function SocialSignIn({
  label = "or continue with",
  google,
  apple,
  disabled,
  onPress,
}: {
  label?: string;
  google: boolean;
  apple: boolean;
  disabled?: boolean;
  onPress: (provider: "google" | "apple") => void;
}) {
  if (!google && !apple) return null;
  return (
    <View style={s.wrap}>
      <View style={s.divider}>
        <View style={s.rule} />
        <Text style={s.label}>{label}</Text>
        <View style={s.rule} />
      </View>
      <View style={s.row}>
        {google && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            onPress={() => onPress("google")}
            disabled={disabled}
            style={({ pressed }) => [
              s.circle,
              s.google,
              disabled && s.disabled,
              pressed && s.pressed,
            ]}
          >
            <Image
              source={require("../assets/google.png")}
              style={{ width: 22, height: 22 }}
            />
          </Pressable>
        )}
        {apple && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
            onPress={() => onPress("apple")}
            disabled={disabled}
            style={({ pressed }) => [
              s.circle,
              s.apple,
              disabled && s.disabled,
              pressed && s.pressed,
            ]}
          >
            <Svg width={19} height={22} viewBox="0 0 384 512">
              <Path fill="#fff" d={APPLE_LOGO} />
            </Svg>
          </Pressable>
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { marginTop: 28, alignItems: "center" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    alignSelf: "stretch",
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.sageLine },
  label: { fontFamily: F.regular, ...T.footnote, color: C.muted },
  row: { flexDirection: "row", gap: 18, marginTop: 18 },
  circle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.ink,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  google: { backgroundColor: C.white, borderWidth: 1, borderColor: C.sageLine },
  apple: { backgroundColor: "#000" },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.94 }] },
});
