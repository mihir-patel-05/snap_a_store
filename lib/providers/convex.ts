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
      if (!repo.store(entry.store_id)) continue;
      const snapshot = repo.publicSnapshot(entry.store_id);
      await client.mutation(
        makeFunctionReference<"mutation">("inventory:sync"),
        { secret: process.env.CONVEX_SYNC_SECRET, snapshot },
      );
      repo.synced(entry.store_id, snapshot.store.revision);
    }
    // Deleted storefronts leave the public projection after pending updates.
    for (const storeId of repo.convexRemovals()) {
      await client.mutation(
        makeFunctionReference<"mutation">("inventory:remove"),
        { secret: process.env.CONVEX_SYNC_SECRET, storeId },
      );
      repo.convexRemoved(storeId);
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
