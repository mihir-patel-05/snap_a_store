import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  stores: defineTable({
    storeId: v.string(),
    revision: v.number(),
    snapshot: v.any(),
  }).index("by_store", ["storeId"]),
});
