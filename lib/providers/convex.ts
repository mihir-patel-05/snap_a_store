import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { repo } from "../repo";
let running: Promise<void> | undefined;
export async function syncInventory() {
  if (!process.env.CONVEX_URL || !process.env.CONVEX_SYNC_SECRET) return;
  if (running) return running;
  running = (async () => {
    const client = new ConvexHttpClient(process.env.CONVEX_URL!);
    for (const entry of repo.outbox()) {
      const snapshot = repo.publicSnapshot(entry.store_id);
      await client.mutation(
        makeFunctionReference<"mutation">("inventory:sync"),
        { secret: process.env.CONVEX_SYNC_SECRET, snapshot },
      );
      repo.synced(entry.store_id, snapshot.store.revision);
    }
  })()
    .catch(() => {
      console.warn("Convex sync pending; durable outbox retained for retry.");
    })
    .finally(() => {
      running = undefined;
    });
  return running;
}
