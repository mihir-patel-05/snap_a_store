import { z } from "zod";

export const ItemStatus = z.enum(["draft", "live", "sold"]);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const DraftItem = z.object({
  name: z.string().min(1),
  suggestedPrice: z.number().nonnegative(), // USD
  confidence: z.number().min(0).max(1),
});
export type DraftItem = z.infer<typeof DraftItem>;

export const Item = DraftItem.extend({
  id: z.string(),
  storeId: z.string(),
  price: z.number().positive(), // seller-confirmed USD
  status: ItemStatus,
  linkId: z.string().optional(), // Visa payment link id
  paymentUrl: z.string().url().optional(),
  updatedAt: z.string(), // ISO timestamp
});
export type Item = z.infer<typeof Item>;

export const Store = z.object({
  id: z.string(),
  name: z.string().min(1),
  createdAt: z.string(),
});
export type Store = z.infer<typeof Store>;

export type StoreEvent =
  | { type: "snapshot"; items: Item[] }
  | { type: "item.updated"; item: Item };

export interface StoreRepo {
  createStore(name: string): Store;
  getStore(storeId: string): Store | undefined;
  getItems(storeId: string): Item[];
  saveItems(items: Item[]): void; // insert or update by id
  setStatus(itemId: string, status: ItemStatus): Item; // sold -> sold is a no-op
  findByLinkId(linkId: string): Item | undefined;
  subscribe(storeId: string, fn: (e: StoreEvent) => void): () => void; // returns unsubscribe
}

// Route payloads
export const ScanResponse = z.object({ items: z.array(DraftItem) });
export const PublishRequest = z.object({
  storeId: z.string(),
  items: z.array(z.object({ name: z.string().min(1), price: z.number().positive() })).min(1),
});
export const PublishResponse = z.object({
  items: z.array(Item),
  errors: z.array(z.object({ name: z.string(), message: z.string() })).optional(),
});
