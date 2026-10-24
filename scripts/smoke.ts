import assert from "node:assert/strict";
const base = process.env.SMOKE_URL || "http://localhost:3000";
async function main() {
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.ok, true);
  const key = await (await fetch(`${base}/api/request-key`)).json();
  assert.match(key.key, /^[a-f0-9-]{36}$/);
  const session = await fetch(`${base}/api/auth/session`);
  assert.equal(session.status, 401);
  for (const path of ["sample", "stores"]) {
    const response = await fetch(`${base}/api/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 404);
  }
  const studio = await fetch(`${base}/studio`);
  assert.equal(studio.status, 200);
  console.log(
    "PASS: server reachable, secure request keys, seller authentication, retired endpoints inaccessible. No payments or catalog writes performed.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
