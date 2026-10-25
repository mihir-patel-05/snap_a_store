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
// Where one item sits in its scan photo, as fractions of the photo's width and height.
export const Box = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0.02).max(1),
    h: z.number().min(0.02).max(1),
  })
  .refine(
    (b) => b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001,
    "The crop must stay inside the photo",
  );
export type Box = z.infer<typeof Box>;
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
  condition: z
    .enum(["Like new", "Good", "Fair", "Check condition"])
    .default("Check condition"),
  reasoning: z.string().max(500).default("Seller review recommended."),
  photoId: z.string().max(80).optional(),
  box: Box.optional(),
});
export type DraftItem = z.infer<typeof DraftItem>;
export type Item = DraftItem & {
  storeId: string;
  remaining: number;
  available: number;
  status: "live" | "sold";
  catalogId?: string;
  variationId?: string;
  publishedAt: string;
  // Seller-only: units held for a Facebook Marketplace buyer, and the listing's state.
  held?: number;
  marketplace?: { status: ListingStatus; url?: string };
};
// Facebook Marketplace has no public listing API for individuals: the seller pastes
// this kit into Facebook's own form. Buyers complete the sale on Marketplace.
export const MarketplaceCondition = z.enum([
  "New",
  "Used – Like New",
  "Used – Good",
  "Used – Fair",
]);
export type MarketplaceCondition = z.infer<typeof MarketplaceCondition>;
export const marketplaceCondition: Partial<
  Record<DraftItem["condition"], MarketplaceCondition>
> = {
  "Like new": "Used – Like New",
  Good: "Used – Good",
  Fair: "Used – Fair",
};
// Suggestions only; the seller confirms against the categories Facebook currently shows.
export const MARKETPLACE_CATEGORIES = [
  "Antiques & Collectibles",
  "Appliances",
  "Arts & Crafts",
  "Baby & Kids",
  "Bags & Luggage",
  "Books, Movies & Music",
  "Clothing, Shoes & Accessories",
  "Electronics",
  "Furniture",
  "Health & Beauty",
  "Home Goods & Decor",
  "Household",
  "Jewelry & Watches",
  "Kitchen & Dining",
  "Miscellaneous",
  "Musical Instruments",
  "Office Supplies",
  "Patio & Garden",
  "Pet Supplies",
  "Sporting Goods",
  "Tools & Home Improvement",
  "Toys & Games",
  "Video Games",
] as const;
export type ListingStatus = "draft" | "listed" | "closed";
export const ListingCopy = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
  category: z.string().trim().min(2).max(60),
  tags: z.array(z.string().trim().min(2).max(40)).max(10),
});
export type ListingCopy = z.infer<typeof ListingCopy>;
export type ListingKit = ListingCopy & {
  itemId: string;
  condition: MarketplaceCondition;
  // Always the published price from SQLite; never model output.
  price: number;
  // null means use the whole photo.
  crop: Box | null;
  warnings: string[];
  status: ListingStatus;
  url?: string;
  listedAt?: string;
  updatedAt: string;
};
export const GenerateListingRequest = z.object({
  condition: MarketplaceCondition.optional(),
});
export const UpdateListingRequest = ListingCopy.partial().extend({
  condition: MarketplaceCondition.optional(),
  crop: Box.nullable().optional(),
  status: z.enum(["draft", "listed", "closed"]).optional(),
  // "" clears the saved link.
  url: z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) => v === "" || facebookLink(v),
      "Paste the listing's facebook.com link",
    )
    .optional(),
});
function facebookLink(value: string) {
  try {
    const { protocol, hostname } = new URL(value);
    return (
      protocol === "https:" &&
      (hostname === "facebook.com" ||
        hostname.endsWith(".facebook.com") ||
        hostname === "fb.me")
    );
  } catch {
    return false;
  }
}
export const HoldRequest = z.object({
  quantity: z.number().int().min(1).max(100),
});
export const SoldElsewhereRequest = z.object({
  quantity: z.number().int().min(1).max(100),
  requestKey: z.string().uuid(),
});
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
