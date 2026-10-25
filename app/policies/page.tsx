import { Brand } from "@/components/brand";
import { business } from "@/lib/server/config";
import { repo } from "@/lib/repo";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Policies({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const { storeId } = await searchParams;
  const store = storeId ? repo.store(storeId) : undefined;
  if (storeId && !store) notFound();
  const info = business(store);
  return (
    <main className="checkout-page">
      <Brand />
      <article
        className="checkout-card"
        style={{ maxWidth: 760, textAlign: "left" }}
      >
        <h1>Shopping with {info.name}</h1>
        <h2>Pickup</h2>
        <p>
          {info.pickup ||
            "Contact the seller for pickup arrangements before purchasing."}
        </p>
        <h2>Returns</h2>
        <p>
          {info.returns ||
            "Contact the seller for their return policy before purchasing."}
        </p>
        <h2>Privacy</h2>
        <p>
          We store product photos, listings, seller sessions, and order records
          to operate this store. Google sign-in stores your Google account
          identifier to keep your store separate from other sellers. Square
          connection tokens are encrypted on the server. Product photos and
          published listings are public. Photos submitted by the seller are sent
          to Anthropic for item recognition. Market comparisons use Apify; store
          narration uses Cartesia; published inventory may be distributed
          through Convex when enabled. Payment information is entered directly
          on Square’s checkout page. This app does not receive or store card
          numbers.
        </p>
        <p>
          Order links let the buyer view their receipt and manage an unpaid
          checkout. Keep these links private. Essential storage keeps seller
          sessions, drafts, and pending checkout identifiers on your device.
          Contact the seller about access or deletion of your information;
          transaction records may need to be retained.
        </p>
        {info.email && (
          <p>
            <a href={`mailto:${info.email}`}>{info.email}</a>
          </p>
        )}
        <a className="text-link" href="/">
          Back to Snap-a-Store
        </a>
      </article>
    </main>
  );
}
