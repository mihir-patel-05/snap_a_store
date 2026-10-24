import type { StoreRepo } from "./contracts";
import { createMockRepo } from "./mocks";

// Owned by the lead. At merge time, after the store agent's contract test passes, switch to:
//   import { sqliteRepo } from "./db";
//   export const repo: StoreRepo = sqliteRepo;

// Keep one instance per process across Next.js hot reloads.
const g = globalThis as unknown as { __snapRepo?: StoreRepo };
export const repo: StoreRepo = g.__snapRepo ?? (g.__snapRepo = createMockRepo());
