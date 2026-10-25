// Client-side checks for the sign-up form. The server validates again
// (SignUpRequest in lib/contracts.ts); these only give early feedback.
export const MINIMUM_SELLER_AGE = 18;
export const MIN_PASSWORD = 8;

export function emailError(email: string) {
  const value = email.trim();
  if (!value) return "Enter your email address.";
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value))
    return "Enter a valid email, like you@example.com.";
  return "";
}

// Formats typed digits as MM/DD/YYYY.
export function formatBirthDate(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
    .filter(Boolean)
    .join("/");
}

// Mirrors ageOn in lib/contracts.ts.
function ageOn(y: number, m: number, d: number, today = new Date()) {
  const before =
    today.getMonth() + 1 < m ||
    (today.getMonth() + 1 === m && today.getDate() < d);
  return today.getFullYear() - y - (before ? 1 : 0);
}

// MM/DD/YYYY → YYYY-MM-DD, or an error message.
export function parseBirthDate(text: string): { iso?: string; error: string } {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return { error: "Enter your date of birth as MM/DD/YYYY." };
  const [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  const age = ageOn(y, m, d);
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d ||
    age < 0 ||
    age > 120
  )
    return { error: "Enter a real date of birth." };
  if (age < MINIMUM_SELLER_AGE)
    return {
      error: `Sellers must be at least ${MINIMUM_SELLER_AGE} to accept payments.`,
    };
  return {
    iso: `${match[3]}-${match[1]}-${match[2]}`,
    error: "",
  };
}
