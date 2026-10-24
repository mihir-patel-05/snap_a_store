// randomUUID is restricted to secure contexts in browsers. getRandomValues also
// works on local HTTP. When neither is available, ask the server for a key.
export async function newRequestKey(): Promise<string> {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto?.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  const response = await fetch("/api/request-key", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !/^[a-f0-9-]{36}$/.test(data.key || ""))
    throw new Error(
      "Unable to prepare checkout. Check your connection and retry.",
    );
  return data.key;
}
