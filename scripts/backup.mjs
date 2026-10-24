import nextEnv from "@next/env";
import Database from "better-sqlite3";
import { mkdirSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
nextEnv.loadEnvConfig(process.cwd(), false);
const source = resolve(process.env.DATABASE_PATH || "data/snap-live.sqlite");
const destination = resolve(process.env.BACKUP_DIR || "data/backups");
mkdirSync(destination, { recursive: true, mode: 0o700 });
const target = join(
  destination,
  `snap-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
);
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(target);
  chmodSync(target, 0o600);
  console.log(`Backup saved: ${target}`);
} finally {
  db.close();
}
