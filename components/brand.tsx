import {
  Coffee,
  LampDesk,
  BookOpen,
  Headphones,
  ShoppingBag,
  Shirt,
} from "lucide-react";
/** The Snap-a-Store mark: a shop awning over a camera lens. Matches public/icon.svg. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="20 22 60 60"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M26 27h48l8 14a8 8 0 0 1-16 0a8 8 0 0 1-16 0a8 8 0 0 1-16 0a8 8 0 0 1-16 0z"
        fill="#d9ef9b"
      />
      <circle
        cx="50"
        cy="66"
        r="11.5"
        fill="none"
        stroke="#d9ef9b"
        strokeWidth="6"
      />
      <circle cx="50" cy="66" r="4.5" fill="#de805d" />
    </svg>
  );
}
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <a className={`brand ${light ? "light" : ""}`} href="/">
      <span className="brand-icon">
        <BrandMark />
      </span>
      snap<span className="brand-dot">a</span>store
      <span className="brand-period">.</span>
    </a>
  );
}
export function ItemArt({
  name,
  category,
  photoId,
}: {
  name: string;
  category?: string;
  photoId?: string;
}) {
  if (photoId)
    return (
      <div className="item-art photo">
        <img src={`/api/photos/${photoId}`} alt={name} />
        <span>From the seller’s photo</span>
      </div>
    );
  const n = name.toLowerCase();
  const Icon = n.includes("mug")
    ? Coffee
    : n.includes("lamp")
      ? LampDesk
      : n.includes("headphone")
        ? Headphones
        : category === "Books"
          ? BookOpen
          : category === "Fashion"
            ? Shirt
            : ShoppingBag;
  return (
    <div
      className={`item-art ${Icon === Coffee ? "blue" : Icon === LampDesk ? "sand" : Icon === BookOpen ? "peach" : "sage"}`}
    >
      <Icon strokeWidth={1.15} />
      <span>Photo unavailable</span>
    </div>
  );
}
