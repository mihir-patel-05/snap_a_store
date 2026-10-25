"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Sparkles,
  Sprout,
  Store as StoreIcon,
  TrendingUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/client";
import {
  ageOn,
  MINIMUM_SELLER_AGE,
  validBirthDate,
  type Store,
  type StoreSnapshot,
} from "@/lib/contracts";

const APPLE_LOGO =
  "M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z";

// Compact round Google and Apple buttons under an "or" divider.
export function SocialSignIn({
  google,
  apple,
  label = "or continue with",
}: {
  google: boolean;
  apple: boolean;
  label?: string;
}) {
  if (!google && !apple) return null;
  return (
    <div className="social-sign-in">
      <p className="auth-rule">
        <span>{label}</span>
      </p>
      <div className="social-row">
        {google && (
          <a
            className="social-circle google"
            href="/api/auth/google/start"
            aria-label="Continue with Google"
            title="Continue with Google"
          >
            <img src="/google.png" alt="" width={22} height={22} />
          </a>
        )}
        {apple && (
          <a
            className="social-circle apple"
            href="/api/auth/apple/start"
            aria-label="Continue with Apple"
            title="Continue with Apple"
          >
            <svg
              aria-hidden="true"
              width={19}
              height={22}
              viewBox="0 0 384 512"
              fill="currentColor"
            >
              <path d={APPLE_LOGO} />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

export type SignUpDetails = {
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  password: string;
};
export function emailError(email: string) {
  const value = email.trim();
  if (!value) return "Enter your email address.";
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value))
    return "Enter a valid email, like you@example.com.";
  return "";
}
function birthDateError(value: string) {
  if (!value) return "Enter your date of birth.";
  if (!validBirthDate(value) || ageOn(value) < 0)
    return "Enter a real date of birth.";
  if (ageOn(value) < MINIMUM_SELLER_AGE)
    return `Sellers must be at least ${MINIMUM_SELLER_AGE} to accept payments.`;
  return "";
}
const MIN_PASSWORD = 8;

export function SignUpForm({
  busy,
  error,
  onSubmit,
  onSignIn,
}: {
  busy: string;
  error: string;
  onSubmit: (details: SignUpDetails) => void;
  onSignIn: () => void;
}) {
  const [form, setForm] = useState({
      firstName: "",
      lastName: "",
      birthDate: "",
      email: "",
      password: "",
    }),
    [touched, setTouched] = useState<Record<string, boolean>>({}),
    [attempted, setAttempted] = useState(false),
    [reveal, setReveal] = useState(false);
  const errors: Record<keyof typeof form, string> = {
    firstName: form.firstName.trim() ? "" : "Enter your first name.",
    lastName: form.lastName.trim() ? "" : "Enter your last name.",
    birthDate: birthDateError(form.birthDate),
    email: emailError(form.email),
    password:
      form.password.length >= MIN_PASSWORD
        ? ""
        : `Use at least ${MIN_PASSWORD} characters.`,
  };
  const valid = Object.values(errors).every((e) => !e);
  const shown = (k: keyof typeof form) =>
    (attempted || touched[k]) && errors[k] ? errors[k] : "";
  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
    "aria-invalid": Boolean(shown(k)),
    "aria-describedby": shown(k) ? `${k}-error` : undefined,
  });
  const today = new Date();
  const latest = new Date(
    today.getFullYear() - MINIMUM_SELLER_AGE,
    today.getMonth(),
    today.getDate(),
  )
    .toISOString()
    .slice(0, 10);
  const note = (k: keyof typeof form, hint?: string) =>
    shown(k) ? (
      <span className="field-error" id={`${k}-error`}>
        {shown(k)}
      </span>
    ) : hint ? (
      <span className="field-hint">{hint}</span>
    ) : null;
  return (
    <>
      <div className="checkout-icon">
        <Sprout size={30} />
      </div>
      <span className="eyebrow">NEW TO SNAPASTORE</span>
      <h1>
        Open your <em>stall.</em>
      </h1>
      <p>A few details and your storefront is ready for its first find.</p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <form
        noValidate
        className="login-form signup-form"
        onSubmit={(e) => {
          e.preventDefault();
          setAttempted(true);
          if (!valid || busy) return;
          onSubmit({
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            birthDate: form.birthDate,
            email: form.email.trim().toLowerCase(),
            password: form.password,
          });
        }}
      >
        <div className="field-pair">
          <label>
            First name
            <input
              autoComplete="given-name"
              maxLength={50}
              {...field("firstName")}
            />
            {note("firstName")}
          </label>
          <label>
            Last name
            <input
              autoComplete="family-name"
              maxLength={50}
              {...field("lastName")}
            />
            {note("lastName")}
          </label>
        </div>
        <label>
          Date of birth
          <input
            type="date"
            autoComplete="bday"
            min="1900-01-01"
            max={latest}
            {...field("birthDate")}
          />
          {note("birthDate")}
        </label>
        <label>
          Email
          <span className="input-adorned">
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              maxLength={254}
              {...field("email")}
            />
            {!errors.email && (
              <span className="input-check" aria-label="Valid email">
                <Check size={13} strokeWidth={3} />
              </span>
            )}
          </span>
          {note("email")}
        </label>
        <label>
          Password
          <span className="input-adorned">
            <input
              type={reveal ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Create a password"
              maxLength={512}
              {...field("password")}
            />
            <button
              type="button"
              className="input-toggle"
              aria-label={reveal ? "Hide password" : "Show password"}
              onClick={() => setReveal((r) => !r)}
            >
              {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
          {note("password", `At least ${MIN_PASSWORD} characters`)}
        </label>
        <button
          className="button primary wide"
          disabled={!!busy}
          aria-disabled={!valid}
        >
          {busy || "Create account"}
          <ArrowRight size={18} />
        </button>
      </form>
      <p className="auth-switch">
        Already selling with us?{" "}
        <button type="button" className="auth-link" onClick={onSignIn}>
          Sign in
        </button>
      </p>
    </>
  );
}

const GUIDE: {
  icon: LucideIcon;
  tint: string;
  eyebrow: string;
  title: string;
  accent: string;
  body: string;
}[] = [
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
    body: "Connect your Square account below your storefront. Buyers check out securely, and you set the pickup and return details they see.",
  },
];
export function Onboarding({
  store,
  firstName,
  lastName,
  askName,
  onRenamed,
  onDone,
}: {
  store: Store;
  firstName?: string;
  lastName?: string;
  // Google and Apple sellers confirm their name first; email sign-up already has it.
  askName?: boolean;
  onRenamed: (store: Store) => void;
  onDone: () => void;
}) {
  // Steps: [about you], storefront name, the guide, then the finale.
  const storeStep = askName ? 1 : 0,
    TOTAL = GUIDE.length + 2 + storeStep;
  const [step, setStep] = useState(0),
    [first, setFirst] = useState(firstName || ""),
    [last, setLast] = useState(lastName || ""),
    [greet, setGreet] = useState(askName ? "" : firstName || ""),
    [name, setName] = useState(store.name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const final = step === TOTAL - 1;
  const guide =
    step > storeStep && !final ? GUIDE[step - storeStep - 1] : null;
  useEffect(() => setError(""), [step]);
  async function next() {
    if (askName && step === 0) {
      const f = first.trim(),
        l = last.trim();
      if (!f || !l) return setError("Enter your first and last name.");
      setBusy(true);
      try {
        await api("/auth/profile", {
          method: "PATCH",
          body: JSON.stringify({ firstName: f, lastName: l }),
        });
      } catch (e) {
        return setError(e instanceof Error ? e.message : "Please try again.");
      } finally {
        setBusy(false);
      }
      setGreet(f);
      // Suggest a personal storefront name in place of the generic default.
      if (name.trim() === "My store") setName(`${f}'s store`.slice(0, 60));
    }
    if (step === storeStep) {
      const trimmed = name.trim();
      if (trimmed.length < 2)
        return setError("Give your storefront a name of at least 2 characters.");
      if (trimmed !== store.name) {
        setBusy(true);
        try {
          const snapshot = await api<StoreSnapshot>(`/stores/${store.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name: trimmed }),
          });
          onRenamed(snapshot.store);
        } catch (e) {
          return setError(e instanceof Error ? e.message : "Please try again.");
        } finally {
          setBusy(false);
        }
      }
    }
    if (final) onDone();
    else setStep((s) => s + 1);
  }
  return (
    <section className="checkout-card onboarding">
      <div className="onboarding-top">
        <button
          type="button"
          className="onboarding-nav"
          aria-label="Back"
          onClick={() => setStep((s) => s - 1)}
          style={{ visibility: step > 0 && !final ? "visible" : "hidden" }}
        >
          <ArrowLeft size={18} />
        </button>
        <span className="onboarding-count">
          {final ? "All set" : `Step ${step + 1} of ${TOTAL}`}
        </span>
        <button
          type="button"
          className="onboarding-nav skip"
          onClick={() => setStep(TOTAL - 1)}
          style={{
            visibility: step > storeStep && !final ? "visible" : "hidden",
          }}
        >
          Skip
        </button>
      </div>
      <div
        className="onboarding-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={TOTAL}
        aria-valuenow={step + 1}
        aria-label="Setup progress"
      >
        <span style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
      </div>
      <div className="onboarding-step" key={step}>
        {askName && step === 0 && (
          <>
            <div className="onboarding-badge" style={{ background: "#e7eddc" }}>
              <UserRound size={32} />
            </div>
            <span className="eyebrow">WELCOME</span>
            <h1>
              First, a little <em>about you.</em>
            </h1>
            <p>Tell us your name so we know who&apos;s behind the stall.</p>
            <form
              className="login-form"
              onSubmit={(e) => {
                e.preventDefault();
                void next();
              }}
            >
              <div className="field-pair">
                <label>
                  First name
                  <input
                    autoComplete="given-name"
                    maxLength={50}
                    value={first}
                    onChange={(e) => setFirst(e.target.value)}
                  />
                </label>
                <label>
                  Last name
                  <input
                    autoComplete="family-name"
                    maxLength={50}
                    value={last}
                    onChange={(e) => setLast(e.target.value)}
                  />
                </label>
              </div>
              <button hidden aria-hidden="true" tabIndex={-1} />
            </form>
          </>
        )}
        {step === storeStep && (
          <>
            <div className="onboarding-badge" style={{ background: "#e7eddc" }}>
              <StoreIcon size={32} />
            </div>
            <span className="eyebrow">
              {greet ? `WELCOME, ${greet.toUpperCase()}` : "WELCOME"}
            </span>
            <h1>
              Name your <em>storefront.</em>
            </h1>
            <p>
              This is what buyers see at the top of your shop. You can change it
              any time.
            </p>
            <form
              className="login-form"
              onSubmit={(e) => {
                e.preventDefault();
                void next();
              }}
            >
              <label>
                Storefront name
                <input
                  className="onboarding-name"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            </form>
          </>
        )}
        {guide && (
          <>
            <div className="onboarding-badge" style={{ background: guide.tint }}>
              <guide.icon size={32} />
            </div>
            <span className="eyebrow">{guide.eyebrow}</span>
            <h1>
              {guide.title} <em>{guide.accent}</em>
            </h1>
            <p>{guide.body}</p>
          </>
        )}
        {final && (
          <>
            <div className="onboarding-halo">
              <span>
                <Sparkles size={38} />
              </span>
            </div>
            <span className="eyebrow">YOU&apos;RE ALL SET</span>
            <h1>
              Your stall is <em>open</em>
              {greet ? `, ${greet}.` : "."}
            </h1>
            <p>
              Pull up a table among the makers, collectors and finders. Snap
              your first piece and we&apos;ll handle the rest.
            </p>
          </>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button
        className="button primary wide"
        disabled={busy}
        onClick={() => void next()}
      >
        {busy ? "Saving" : final ? "Start selling" : "Continue"}
        <ArrowRight size={18} />
      </button>
    </section>
  );
}
