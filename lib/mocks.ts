import type { DraftItem, Item, ItemStatus, Store, StoreEvent, StoreRepo } from "./contracts";

const now = () => new Date().toISOString();
const id = () => Math.random().toString(36).slice(2, 10);

export const mockDraftItems: DraftItem[] = [
  { name: "Blue ceramic mug", suggestedPrice: 4, confidence: 0.92 },
  { name: "Paperback novels (x6)", suggestedPrice: 6, confidence: 0.81 },
  { name: "Brass desk lamp", suggestedPrice: 15, confidence: 0.74 },
  { name: "Wireless headphones (brand unclear)", suggestedPrice: 20, confidence: 0.48 },
];

export function mockPaymentUrl(itemId: string) {
  return `https://example.test/pay/${itemId}`;
}

const ORDER: Record<ItemStatus, number> = { draft: 0, live: 1, sold: 2 };

/** In-memory StoreRepo. Same interface as the store agent's SQLite version. */
export function createMockRepo(): StoreRepo {
  const stores = new Map<string, Store>();
  const items = new Map<string, Item>();
  const subs = new Map<string, Set<(e: StoreEvent) => void>>();

  const emit = (item: Item) =>
    subs.get(item.storeId)?.forEach((fn) => fn({ type: "item.updated", item }));

  return {
    createStore(name) {
      const s = { id: id(), name, createdAt: now() };
      stores.set(s.id, s);
      return s;
    },
    getStore: (storeId) => stores.get(storeId),
    getItems: (storeId) => [...items.values()].filter((i) => i.storeId === storeId),
    saveItems(list) {
      for (const it of list) {
        const saved = { ...it, updatedAt: now() };
        items.set(saved.id, saved);
        emit(saved);
      }
    },
    setStatus(itemId, status) {
      const it = items.get(itemId);
      if (!it) throw new Error(`Unknown item ${itemId}`);
      if (it.status === status) return it;
      if (ORDER[status] < ORDER[it.status]) throw new Error(`Cannot move ${it.status} -> ${status}`);
      const next = { ...it, status, updatedAt: now() };
      items.set(itemId, next);
      emit(next);
      return next;
    },
    findByLinkId: (linkId) => [...items.values()].find((i) => i.linkId === linkId),
    subscribe(storeId, fn) {
      if (!subs.has(storeId)) subs.set(storeId, new Set());
      subs.get(storeId)!.add(fn);
      return () => subs.get(storeId)?.delete(fn);
    },
  };
}
