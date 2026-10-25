import type { DraftItem } from "../../lib/contracts";
export const fixtureItems: DraftItem[] = [
  {
    id: "fixture-mug",
    name: "Blue ceramic mug",
    description:
      "A little character for your morning coffee. Glazed ceramic with a generous handle.",
    category: "Home",
    suggestedPrice: 8,
    price: 8,
    quantity: 2,
    confidence: 0.96,
    condition: "Good",
    reasoning:
      "Demo estimate for a secondhand ceramic mug. Check for chips before selling.",
  },
  {
    id: "fixture-lamp",
    name: "Vintage brass lamp",
    description:
      "Warm light, timeless shape. A brass-tone desk lamp looking for its next reading nook.",
    category: "Home",
    suggestedPrice: 28,
    price: 28,
    quantity: 1,
    confidence: 0.88,
    condition: "Check condition",
    reasoning:
      "Demo estimate. Test the switch and wiring; material and age are unverified.",
    priceRationale: {
      assumedCondition: "Check condition",
      conditionNote: "Finish looks intact; power and wiring cannot be seen.",
      factors: ["Brass-tone finish, maker unknown", "Working order untested"],
    },
  },
  {
    id: "fixture-books",
    name: "Weekend reading bundle",
    description: "Three well-loved paperbacks, ready for a slow Sunday.",
    category: "Books",
    suggestedPrice: 12,
    price: 12,
    quantity: 1,
    confidence: 0.93,
    condition: "Good",
    reasoning:
      "Demo estimate for one bundle of three books, not a price per book.",
  },
  {
    id: "fixture-headphones",
    name: "Over-ear headphones",
    description:
      "Over-ear headphones with soft ear cushions. Brand and battery condition need checking.",
    category: "Electronics",
    suggestedPrice: 24,
    price: 24,
    quantity: 1,
    confidence: 0.62,
    condition: "Check condition",
    reasoning:
      "Demo estimate only. Confirm the brand, connectivity, and working condition.",
  },
];
