import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
// Only the trusted backend can write. Public clients receive published storefront data.
export const sync = mutationGeneric({
  args: { secret: v.string(), snapshot: v.any() },
  handler: async (ctx, args) => {
    if (
      !process.env.CONVEX_SYNC_SECRET ||
      args.secret !== process.env.CONVEX_SYNC_SECRET
    )
      throw new Error("Unauthorized");
    const { store } = args.snapshot;
    if (
      typeof store?.id !== "string" ||
      !Number.isSafeInteger(store.revision) ||
      !Array.isArray(args.snapshot.items)
    )
      throw new Error("Invalid snapshot");
    const existing = await ctx.db
      .query("stores")
      .withIndex("by_store", (q) => q.eq("storeId", store.id))
      .unique();
    if (existing && existing.revision >= store.revision) return;
    const value = {
      storeId: store.id,
      revision: store.revision,
      snapshot: args.snapshot,
    };
    if (existing) await ctx.db.replace(existing._id, value);
    else await ctx.db.insert("stores", value);
  },
});
export const watch = queryGeneric({
  args: { storeId: v.string() },
  handler: async (ctx, { storeId }) => {
    return (
      (
        await ctx.db
          .query("stores")
          .withIndex("by_store", (q) => q.eq("storeId", storeId))
          .unique()
      )?.snapshot ?? null
    );
  },
});

export const check = queryGeneric({
  args: { secret: v.string() },
  handler: async (_ctx, { secret }) => {
    if (
      !process.env.CONVEX_SYNC_SECRET ||
      secret !== process.env.CONVEX_SYNC_SECRET
    )
      throw new Error("Unauthorized");
    return { ok: true };
  },
});
