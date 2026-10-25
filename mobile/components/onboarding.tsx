import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowRight,
  Camera,
  ChevronLeft,
  CreditCard,
  Sparkles,
  Store as StoreIcon,
  TrendingUp,
  UserRound,
} from "lucide-react-native";
import { api, type Session } from "../lib/api";
import { C, F, R, T } from "../lib/theme";
import type { StoreSnapshot } from "../../lib/contracts";

type Step = {
  icon: React.ComponentType<{ size: number; color: string }>;
  tint: string;
  eyebrow: string;
  title: string;
  accent: string;
  body: string;
};
// The storefront-name step comes first; these follow it.
const GUIDE: Step[] = [
  {
    icon: Camera,
    tint: "#e7efd2",
    eyebrow: "SNAP",
    title: "Point, shoot,",
    accent: "listed.",
    body: "Take a photo of anything you'd like to sell. Claude identifies it and drafts the title, details and condition for you to review.",
  },
  {
    icon: TrendingUp,
    tint: "#f6e3d6",
    eyebrow: "PRICE",
    title: "Priced by the",
    accent: "market.",
    body: "Suggested prices are checked against live listings, so they land where buyers are looking. Nothing goes live until you approve it.",
  },
  {
    icon: CreditCard,
    tint: "#e4e9f3",
    eyebrow: "GET PAID",
    title: "Paid straight to",
    accent: "you.",
    body: "Connect your Square account from My store. Buyers check out securely, and you set the pickup and return details they see.",
  },
];
export function Onboarding({
  session,
  firstName,
  lastName,
  askName,
  onRenamed,
  onDone,
}: {
  session: Session;
  firstName?: string;
  lastName?: string;
  // Google and Apple sellers confirm their name first; email sign-up already has it.
  askName?: boolean;
  onRenamed: (store: Session["store"]) => void;
  onDone: () => void;
}) {
  // Steps: [about you], storefront name, the guide, then the finale.
  const intro = askName ? 1 : 0,
    storeStep = intro,
    TOTAL = GUIDE.length + 2 + intro;
  const [step, setStep] = useState(0),
    [first, setFirst] = useState(firstName || ""),
    [last, setLast] = useState(lastName || ""),
    [greet, setGreet] = useState(askName ? "" : firstName || ""),
    [name, setName] = useState(session.store.name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lastInput = useRef<React.ElementRef<typeof TextInput>>(null);
  const progress = useRef(new Animated.Value(1 / TOTAL)).current,
    fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: (step + 1) / TOTAL,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [step, progress, fade, TOTAL]);
  const final = step === TOTAL - 1;
  async function next() {
    setError("");
    if (askName && step === 0) {
      const f = first.trim(),
        l = last.trim();
      if (!f || !l) {
        setError("Enter your first and last name.");
        return;
      }
      setBusy(true);
      try {
        await api("/auth/profile", session.token, { firstName: f, lastName: l }, "PATCH");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Please try again.");
        return;
      } finally {
        setBusy(false);
      }
      setGreet(f);
      // Suggest a personal storefront name in place of the generic default.
      if (name.trim() === "My store") setName(`${f}'s store`.slice(0, 60));
    }
    if (step === storeStep) {
      const trimmed = name.trim();
      if (trimmed.length < 2) {
        setError("Give your storefront a name of at least 2 characters.");
        return;
      }
      if (trimmed !== session.store.name) {
        setBusy(true);
        try {
          const snapshot = await api<StoreSnapshot>(
            `/stores/${session.store.id}`,
            session.token,
            { name: trimmed },
            "PATCH",
          );
          onRenamed(snapshot.store);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Please try again.");
          return;
        } finally {
          setBusy(false);
        }
      }
    }
    if (final) onDone();
    else setStep((s) => s + 1);
  }
  const guide = step > storeStep && !final ? GUIDE[step - storeStep - 1] : null;
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <View style={s.headerRow}>
          {step > 0 && !final ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
              onPress={() => setStep((s) => s - 1)}
            >
              <ChevronLeft size={24} color={C.ink} />
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
          <Text style={s.stepCount}>
            {final ? "All set" : `Step ${step + 1} of ${TOTAL}`}
          </Text>
          {!final && step > storeStep ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => setStep(TOTAL - 1)}
            >
              <Text style={s.skip}>Skip</Text>
            </Pressable>
          ) : (
            <View style={{ width: 32 }} />
          )}
        </View>
        <View
          style={s.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: TOTAL, now: step + 1 }}
        >
          <Animated.View
            style={[
              s.fill,
              {
                width: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.body}
        >
          <Animated.View
            style={{
              opacity: fade,
              transform: [
                {
                  translateY: fade.interpolate({
                    inputRange: [0, 1],
                    outputRange: [14, 0],
                  }),
                },
              ],
            }}
          >
            {askName && step === 0 && (
              <>
                <View style={[s.badge, { backgroundColor: C.sage }]}>
                  <UserRound size={38} color={C.green} />
                </View>
                <Text style={s.eyebrow}>WELCOME</Text>
                <Text style={s.title}>
                  First, a little <Text style={s.italic}>about you.</Text>
                </Text>
                <Text style={s.copy}>
                  Tell us your name so we know who's behind the stall.
                </Text>
                <View style={[s.card, s.nameRow]}>
                  <View style={s.nameField}>
                    <Text style={s.label}>FIRST NAME</Text>
                    <TextInput
                      style={s.personInput}
                      value={first}
                      onChangeText={setFirst}
                      placeholder="Ada"
                      placeholderTextColor={C.quiet}
                      maxLength={50}
                      autoCapitalize="words"
                      autoComplete="given-name"
                      textContentType="givenName"
                      returnKeyType="next"
                      onSubmitEditing={() => lastInput.current?.focus()}
                      accessibilityLabel="First name"
                    />
                  </View>
                  <View style={s.nameField}>
                    <Text style={s.label}>LAST NAME</Text>
                    <TextInput
                      ref={lastInput}
                      style={s.personInput}
                      value={last}
                      onChangeText={setLast}
                      placeholder="Lovelace"
                      placeholderTextColor={C.quiet}
                      maxLength={50}
                      autoCapitalize="words"
                      autoComplete="family-name"
                      textContentType="familyName"
                      returnKeyType="next"
                      onSubmitEditing={() => void next()}
                      accessibilityLabel="Last name"
                    />
                  </View>
                </View>
              </>
            )}
            {step === storeStep && (
              <>
                <View style={[s.badge, { backgroundColor: C.sage }]}>
                  <StoreIcon size={38} color={C.green} />
                </View>
                <Text style={s.eyebrow}>
                  {greet ? `WELCOME, ${greet.toUpperCase()}` : "WELCOME"}
                </Text>
                <Text style={s.title}>
                  Name your <Text style={s.italic}>storefront.</Text>
                </Text>
                <Text style={s.copy}>
                  This is what buyers see at the top of your shop. You can
                  change it any time from My store.
                </Text>
                <View style={s.card}>
                  <Text style={s.label}>STOREFRONT NAME</Text>
                  <TextInput
                    style={s.nameInput}
                    value={name}
                    onChangeText={setName}
                    maxLength={60}
                    autoCapitalize="words"
                    returnKeyType="next"
                    onSubmitEditing={() => void next()}
                    accessibilityLabel="Storefront name"
                  />
                </View>
              </>
            )}
            {guide && (
              <>
                <View style={[s.badge, { backgroundColor: guide.tint }]}>
                  <guide.icon size={38} color={C.green} />
                </View>
                <Text style={s.eyebrow}>{guide.eyebrow}</Text>
                <Text style={s.title}>
                  {guide.title} <Text style={s.italic}>{guide.accent}</Text>
                </Text>
                <Text style={s.copy}>{guide.body}</Text>
              </>
            )}
            {final && (
              <View style={s.finale}>
                <View style={s.halo}>
                  <View style={s.haloInner}>
                    <Sparkles size={44} color={C.green} />
                  </View>
                </View>
                <Text style={[s.eyebrow, { textAlign: "center" }]}>
                  YOU'RE ALL SET
                </Text>
                <Text style={[s.title, { textAlign: "center" }]}>
                  Your stall is <Text style={s.italic}>open</Text>
                  {greet ? `, ${greet}.` : "."}
                </Text>
                <Text style={[s.copy, { textAlign: "center" }]}>
                  Pull up a table among the makers, collectors and finders.
                  Snap your first piece and we'll handle the rest.
                </Text>
              </View>
            )}
          </Animated.View>
          {!!error && (
            <Text style={s.error} accessibilityRole="alert">
              {error}
            </Text>
          )}
        </ScrollView>
        <View style={s.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void next()}
            disabled={busy}
            style={({ pressed }) => [
              s.button,
              busy && { opacity: 0.55 },
              pressed && {
                transform: [{ scale: 0.985 }],
                backgroundColor: C.ink,
              },
            ]}
          >
            <Text style={s.buttonText}>
              {busy ? "Saving" : final ? "Start selling" : "Continue"}
            </Text>
            <ArrowRight size={19} color="white" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
    marginBottom: 10,
  },
  stepCount: {
    fontFamily: F.semi,
    ...T.caption,
    letterSpacing: 1,
    color: C.muted,
    textTransform: "uppercase",
  },
  skip: { fontFamily: F.semi, ...T.subhead, color: C.green },
  track: {
    height: 6,
    borderRadius: R.pill,
    backgroundColor: C.line,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: R.pill, backgroundColor: C.green },
  body: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    paddingBottom: 32,
  },
  badge: {
    width: 84,
    height: 84,
    borderRadius: R.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 26,
  },
  eyebrow: {
    fontFamily: F.semi,
    ...T.caption,
    letterSpacing: 1.3,
    color: C.muted,
  },
  title: {
    fontFamily: F.serif,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1.2,
    color: C.ink,
    marginTop: 6,
  },
  italic: { fontFamily: F.italic, color: C.moss },
  copy: {
    fontFamily: F.regular,
    ...T.callout,
    lineHeight: 24,
    color: C.muted,
    marginTop: 12,
  },
  card: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    padding: 20,
    marginTop: 26,
  },
  label: {
    fontFamily: F.semi,
    ...T.caption,
    letterSpacing: 1,
    color: C.muted,
    marginBottom: 6,
  },
  nameRow: { flexDirection: "row", gap: 16 },
  nameField: { flex: 1, minWidth: 0 },
  personInput: {
    fontFamily: F.regular,
    fontSize: 17,
    lineHeight: 22,
    color: C.ink,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 10,
    minHeight: 46,
    minWidth: 0,
  },
  nameInput: {
    fontFamily: F.serif,
    fontSize: 24,
    lineHeight: 30,
    color: C.ink,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 10,
    minHeight: 50,
  },
  finale: { alignItems: "center" },
  halo: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: "#eef3df",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  haloInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    fontFamily: F.regular,
    ...T.subhead,
    color: C.errorInk,
    marginTop: 16,
  },
  footer: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 },
  button: {
    backgroundColor: C.green,
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  buttonText: { fontFamily: F.semi, ...T.headline, color: "white" },
});
