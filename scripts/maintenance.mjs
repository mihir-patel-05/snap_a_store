import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), false);
const base = process.env.MAINTENANCE_BASE_URL || process.env.PUBLIC_BASE_URL;
const secret = process.env.MAINTENANCE_SECRET;
if (!base || !secret) {
  console.error("Set PUBLIC_BASE_URL and MAINTENANCE_SECRET.");
  process.exit(1);
}
const watch = process.argv.includes("--watch");
async function run() {
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/api/maintenance`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(900000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    console.log(new Date().toISOString(), JSON.stringify(data));
    if (data.failed && !watch) process.exitCode = 1;
  } catch (e) {
    console.error(
      "Maintenance failed:",
      e instanceof Error ? e.message : "unknown error",
    );
    if (!watch) process.exitCode = 1;
  }
}
do {
  await run();
  if (watch) await new Promise((resolve) => setTimeout(resolve, 60000));
} while (watch);
