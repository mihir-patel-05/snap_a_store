import {
  Coffee,
  LampDesk,
  BookOpen,
  Headphones,
  ShoppingBag,
  Shirt,
} from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <a
      className={`brand ${light ? "light" : ""}`}
      href="/"
      aria-label="Snap-a-Store home"
    >
      <span className="brand-icon">
        <img src="/icon.svg" alt="" width={37} height={37} />
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
