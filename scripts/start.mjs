import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import nextEnv from "@next/env";
const root = process.cwd();
nextEnv.loadEnvConfig(root, false);
const standalone = resolve(root, ".next/standalone");
if (!existsSync(resolve(standalone, "server.js"))) {
  console.error("Run npm run build before starting the production server.");
  process.exit(1);
}
cpSync(resolve(root, "public"), resolve(standalone, "public"), {
  recursive: true,
});
cpSync(resolve(root, ".next/static"), resolve(standalone, ".next/static"), {
  recursive: true,
});
const portArg = process.argv.indexOf("--port");
const port =
  portArg === -1 ? process.env.PORT || "3000" : process.argv[portArg + 1];
if (!port || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  console.error("Provide a port between 1 and 65535.");
  process.exit(1);
}
const child = spawn(process.execPath, [resolve(standalone, "server.js")], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: process.env.SNAP_HOST || "0.0.0.0",
    PORT: port,
    DATABASE_PATH: resolve(
      root,
      process.env.DATABASE_PATH || "data/snap-live.sqlite",
    ),
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
