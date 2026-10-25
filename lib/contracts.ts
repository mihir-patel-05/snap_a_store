import { z } from "zod";

export const Money = z
  .number()
  .finite()
  .min(0.5)
  .max(10000)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Use at most two decimal places",
  );
export const Condition = z.enum([
  "Like new",
  "Good",
  "Fair",
  "Check condition",
]);
export type Condition = z.infer<typeof Condition>;
// Claude's explanation of its estimate, for the seller only. assumedCondition
// keeps Claude's original call after the seller corrects `condition`.
export const PriceRationale = z.object({
  assumedCondition: Condition,
  conditionNote: z.string().max(200),
  factors: z.array(z.string().trim().min(1).max(140)).max(4),
});
export type PriceRationale = z.infer<typeof PriceRationale>;
export const DraftItem = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(2).max(100),
  description: z.string().max(400).default(""),
  category: z
    .enum(["Home", "Books", "Electronics", "Fashion", "Other"])
    .default("Other"),
  suggestedPrice: Money,
  price: Money,
  quantity: z.number().int().min(1).max(100),
  confidence: z.number().min(0).max(1),
  condition: Condition.default("Check condition"),
  reasoning: z.string().max(500).default("Seller review recommended."),
  // Optional so drafts saved before this field, and items already published, stay valid.
  priceRationale: PriceRationale.optional(),
  photoId: z.string().max(80).optional(),
});
export type DraftItem = z.infer<typeof DraftItem>;
export const ItemChanges = DraftItem.pick({
  name: true,
  description: true,
  category: true,
  price: true,
  condition: true,
}).extend({ remaining: z.number().int().min(0).max(100) });
export const EditItemRequest = ItemChanges.extend({
  requestKey: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
});
export type EditItemRequest = z.infer<typeof EditItemRequest>;
export type Item = DraftItem & {
  storeId: string;
  remaining: number;
  available: number;
  status: "live" | "sold";
  catalogId?: string;
  variationId?: string;
  publishedAt: string;
  editVersion?: number;
  editing?: boolean;
  pendingEdit?: EditItemRequest;
};
export type Store = {
  id: string;
  name: string;
  tagline: string;
  createdAt: string;
  revision: number;
  paymentMode: "production" | "sandbox";
  locationId?: string;
  paymentProvider?: "platform" | "square_oauth";
  merchantId?: string;
  business?: StoreBusiness;
  // Set while the seller deletes this storefront; checkouts and publishing stop.
  closing?: boolean;
};
export const StoreBusiness = z.object({
  email: z.string().email().max(254),
  pickup: z.string().trim().min(3).max(1000),
  returns: z.string().trim().min(3).max(1000),
  taxPercent: z
    .string()
    .regex(/^\d{1,2}(\.\d{1,4})?$/)
    .refine((v) => Number(v) <= 30),
});
export type StoreBusiness = z.infer<typeof StoreBusiness>;
export type PaymentConnection = {
  connected: boolean;
  available: boolean;
  locationId?: string;
  locations: { id: string; name: string }[];
  business?: StoreBusiness;
};
export type StoreSummary = Store & { listed: number; available: number };
export const CreateStoreRequest = z.object({
  name: z.string().trim().min(2).max(60),
  requestKey: z.string().uuid(),
});
// The seller retypes the storefront's name to confirm a permanent delete.
export const DeleteStoreRequest = z.object({
  name: z.string().trim().min(1).max(60),
});
export type StoreSnapshot = {
  store: Store;
  items: Item[];
  stats: { revenue: number; sold: number; orders: number };
  activity: { id: string; message: string; at: string }[];
};
export type Order = {
  id: string;
  storeId: string;
  requestKey: string;
  fingerprint: string;
  lines: {
    itemId: string;
    name: string;
    quantity: number;
    price: number;
    variationId?: string;
  }[];
  totalCents: number;
  state: "creating" | "pending" | "paid" | "failed";
  mode: "production" | "sandbox";
  taxPercent: string;
  subtotalCents: number;
  taxCents: number;
  expiresAt: string;
  receiptUrl?: string;
  lastCheckedAt?: string;
  createdAt: string;
  paymentUrl?: string;
  linkId?: string;
  squareOrderId?: string;
  paymentId?: string;
};
export const PublishRequest = z
  .object({
    storeId: z.string().min(1),
    requestKey: z.string().uuid(),
    items: z.array(DraftItem).min(1).max(30),
  })
  .refine(
    (v) => new Set(v.items.map((i) => i.id)).size === v.items.length,
    "Duplicate item IDs",
  );
export const CheckoutRequest = z
  .object({
    storeId: z.string(),
    requestKey: z.string().uuid(),
    lines: z
      .array(
        z.object({
          itemId: z.string(),
          quantity: z.number().int().min(1).max(100),
        }),
      )
      .min(1)
      .max(30),
  })
  .refine(
    (v) => new Set(v.lines.map((l) => l.itemId)).size === v.lines.length,
    "Duplicate items in cart",
  );
export type Comparison = {
  title: string;
  price: number;
  url: string;
  currency: "USD";
};
export type Integration = {
  name: string;
  feature: string;
  status: "ready" | "setup";
  detail: string;
};
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 ? 2 : 0,
  }).format(value);
