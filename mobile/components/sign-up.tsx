import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowRight, Check, Eye, EyeOff, Sprout } from "lucide-react-native";
import { C, F, R, T } from "../lib/theme";
import {
  emailError,
  formatBirthDate,
  MIN_PASSWORD,
  parseBirthDate,
} from "../lib/signup";

export type SignUpDetails = {
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  password: string;
};

export function SignUp({
  busy,
  error,
  onSubmit,
  onSignIn,
  footer,
}: {
  busy: string;
  error: string;
  onSubmit: (details: SignUpDetails) => void;
  onSignIn: () => void;
  footer?: React.ReactNode;
}) {
  const [firstName, setFirstName] = useState(""),
    [lastName, setLastName] = useState(""),
    [birth, setBirth] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [reveal, setReveal] = useState(false),
    [touched, setTouched] = useState<Record<string, boolean>>({}),
    [attempted, setAttempted] = useState(false);
  type Input = React.ElementRef<typeof TextInput>;
  const last = useRef<Input>(null),
    dob = useRef<Input>(null),
    mail = useRef<Input>(null),
    pass = useRef<Input>(null);
  const birthDate = parseBirthDate(birth);
  const errors = {
    firstName: firstName.trim() ? "" : "Enter your first name.",
    lastName: lastName.trim() ? "" : "Enter your last name.",
    birth: birthDate.error,
    email: emailError(email),
    password:
      password.length >= MIN_PASSWORD
        ? ""
        : `Use at least ${MIN_PASSWORD} characters.`,
  };
  const show = (field: keyof typeof errors) =>
    (attempted || touched[field]) && errors[field] ? errors[field] : "";
  const blur = (field: string) => () =>
    setTouched((t) => ({ ...t, [field]: true }));
  const valid = Object.values(errors).every((e) => !e);
  function submit() {
    setAttempted(true);
    if (!valid || busy) return;
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate: birthDate.iso!,
      email: email.trim().toLowerCase(),
      password,
    });
  }
  return (
    <View>
      <View style={s.badge}>
        <Sprout size={34} color={C.green} />
      </View>
      <Text style={s.eyebrow}>NEW TO SNAPASTORE</Text>
      <Text style={s.title}>
        Open your <Text style={s.italic}>stall.</Text>
      </Text>
      <Text style={s.subtitle}>
        A few details and your storefront is ready for its first find.
      </Text>
      <View style={s.card}>
        <View style={s.row}>
          <Field label="FIRST NAME" error={show("firstName")} flex>
            <TextInput
              style={s.input}
              value={firstName}
              onChangeText={setFirstName}
              onBlur={blur("firstName")}
              placeholder="Ada"
              placeholderTextColor={C.quiet}
              autoComplete="given-name"
              textContentType="givenName"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => last.current?.focus()}
              accessibilityLabel="First name"
            />
          </Field>
          <Field label="LAST NAME" error={show("lastName")} flex>
            <TextInput
              ref={last}
              style={s.input}
              value={lastName}
              onChangeText={setLastName}
              onBlur={blur("lastName")}
              placeholder="Lovelace"
              placeholderTextColor={C.quiet}
              autoComplete="family-name"
              textContentType="familyName"
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => dob.current?.focus()}
              accessibilityLabel="Last name"
            />
          </Field>
        </View>
        <Field label="DATE OF BIRTH" error={show("birth")}>
          <TextInput
            ref={dob}
            style={s.input}
            value={birth}
            onChangeText={(t) => setBirth(formatBirthDate(t))}
            onBlur={blur("birth")}
            placeholder="MM/DD/YYYY"
            placeholderTextColor={C.quiet}
            keyboardType="number-pad"
            autoComplete="birthdate-full"
            maxLength={10}
            returnKeyType="next"
            onSubmitEditing={() => mail.current?.focus()}
            accessibilityLabel="Date of birth, month day year"
          />
        </Field>
        <Field label="EMAIL" error={show("email")}>
          <View style={s.inline}>
            <TextInput
              ref={mail}
              style={[s.input, s.grow, s.bare]}
              value={email}
              onChangeText={setEmail}
              onBlur={blur("email")}
              placeholder="you@example.com"
              placeholderTextColor={C.quiet}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => pass.current?.focus()}
              accessibilityLabel="Email"
            />
            {!errors.email && (
              <View style={s.valid} accessibilityLabel="Valid email">
                <Check size={14} color={C.white} strokeWidth={3} />
              </View>
            )}
          </View>
        </Field>
        <Field
          label="PASSWORD"
          error={show("password")}
          hint={`At least ${MIN_PASSWORD} characters`}
          last
        >
          <View style={s.inline}>
            <TextInput
              ref={pass}
              style={[s.input, s.grow, s.bare]}
              value={password}
              onChangeText={setPassword}
              onBlur={blur("password")}
              placeholder="Create a password"
              placeholderTextColor={C.quiet}
              secureTextEntry={!reveal}
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={submit}
              accessibilityLabel="Password"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={reveal ? "Hide password" : "Show password"}
              hitSlop={12}
              onPress={() => setReveal((r) => !r)}
            >
              {reveal ? (
                <EyeOff size={20} color={C.muted} />
              ) : (
                <Eye size={20} color={C.muted} />
              )}
            </Pressable>
          </View>
        </Field>
      </View>
      {!!error && (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={submit}
        disabled={!!busy}
        style={({ pressed }) => [
          s.button,
          (!valid || !!busy) && { opacity: 0.55 },
          pressed && { transform: [{ scale: 0.985 }], backgroundColor: C.ink },
        ]}
      >
        <Text style={s.buttonText}>{busy || "Create account"}</Text>
        <ArrowRight size={19} color="white" />
      </Pressable>
      <Text style={s.switch}>
        Already selling with us?{" "}
        <Text
          style={s.link}
          accessibilityRole="link"
          onPress={onSignIn}
          suppressHighlighting
        >
          Sign in
        </Text>
      </Text>
      {footer}
    </View>
  );
}
function Field({
  label,
  error,
  hint,
  flex,
  last,
  children,
}: {
  label: string;
  error: string;
  hint?: string;
  flex?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[flex && s.grow, !last && { marginBottom: 18 }]}>
      <Text style={s.label}>{label}</Text>
      {children}
      {error ? (
        <Text style={s.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={s.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  badge: {
    width: 76,
    height: 76,
    borderRadius: R.xl,
    backgroundColor: C.sage,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
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
  subtitle: {
    fontFamily: F.regular,
    ...T.callout,
    lineHeight: 24,
    color: C.muted,
    marginTop: 8,
    marginBottom: 24,
  },
  card: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.md,
    padding: 20,
    marginBottom: 16,
  },
  row: { flexDirection: "row", gap: 16 },
  grow: { flex: 1, minWidth: 0 },
  bare: { borderBottomWidth: 0 },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  label: {
    fontFamily: F.semi,
    ...T.caption,
    letterSpacing: 1,
    color: C.muted,
    marginBottom: 6,
  },
  input: {
    fontFamily: F.regular,
    fontSize: 17,
    lineHeight: 22,
    color: C.ink,
    paddingVertical: 10,
    minHeight: 46,
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  valid: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.leaf,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { fontFamily: F.regular, ...T.caption, color: C.muted, marginTop: 6 },
  fieldError: {
    fontFamily: F.medium,
    ...T.caption,
    color: C.errorInk,
    marginTop: 6,
  },
  error: {
    fontFamily: F.regular,
    ...T.subhead,
    color: C.errorInk,
    backgroundColor: C.errorBg,
    borderRadius: R.sm,
    padding: 12,
    marginBottom: 14,
    overflow: "hidden",
  },
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
  switch: {
    fontFamily: F.regular,
    ...T.subhead,
    color: C.muted,
    textAlign: "center",
    marginTop: 20,
  },
  link: {
    fontFamily: F.semi,
    color: C.green,
    textDecorationLine: "underline",
  },
});
