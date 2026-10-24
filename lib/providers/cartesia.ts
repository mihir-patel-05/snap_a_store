import type { StoreSnapshot } from "../contracts";
import { AppError, requireConfig } from "../server/errors";
export function narration(s: StoreSnapshot, language = "en") {
  const available = s.items.filter((i) => i.available > 0);
  // Deterministic facts avoid invented products, discounts, or availability.
  if (language === "es")
    return `Bienvenido a ${s.store.name}. ${available.length ? available.map((i) => `${i.name}. ${i.price.toFixed(2)} dólares. ${i.available} disponibles.`).join(" ") : "Todo se ha vendido. Gracias por visitarnos."}`;
  return `Welcome to ${s.store.name}. ${available.length ? available.map((i) => `${i.name}. ${i.price.toFixed(2)} dollars. ${i.available} available. ${i.description}`).join(" ") : "Everything has found a new home. Thanks for stopping by."}`;
}
export async function speak(transcript: string, language: "en" | "es") {
  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireConfig("CARTESIA_API_KEY")}`,
      "Cartesia-Version": process.env.CARTESIA_VERSION || "2026-08-14",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: process.env.CARTESIA_MODEL || "sonic-3.6",
      transcript,
      voice: requireConfig("CARTESIA_VOICE_ID"),
      language,
      output_format: {
        container: "wav",
        encoding: "pcm_s16le",
        sample_rate: 44100,
      },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new AppError(
      502,
      "Audio is temporarily unavailable. All product details are still on screen.",
    );
  return response.arrayBuffer();
}
