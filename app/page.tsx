import {
  ArrowUpRight,
  Camera,
  Check,
  QrCode,
  Sparkles,
  Leaf,
  ArrowRight,
  ScanLine,
} from "lucide-react";
import { Brand } from "@/components/brand";
export default function Home() {
  return (
    <main className="landing">
      <header className="site-header">
        <Brand />
        <a className="text-link" href="/studio">
          Seller sign in <ArrowUpRight size={17} />
        </a>
      </header>
      <section className="landing-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="live-dot" /> SMALL STORES. BIG POSSIBILITIES.
          </span>
          <h1>
            Your table.
            <br />
            Your next
            <br />
            <em>little store.</em>
          </h1>
          <p>
            Turn the things you’re ready to let go of into a shop people can
            fall in love with. Just snap, set your prices, and share.
          </p>
          <a href="/studio" className="button primary">
            Open your store <ArrowRight size={19} />
          </a>
          <span className="hero-note">
            <Check size={15} /> Your photos. Your prices. Secure Square
            checkout.
          </span>
        </div>
        <div className="hero-visual">
          <div className="photo-label">
            <ScanLine size={16} /> A table full of possibilities
          </div>
          <img
            className="table-photo"
            src="/table.svg"
            alt="Illustration of a mug, brass lamp, books, and headphones on a table"
          />
          <div className="floating-card">
            <div className="sparkle-tile">
              <Sparkles size={24} />
            </div>
            <div>
              <strong>A little help from AI.</strong>
              <span>You always have the final say.</span>
            </div>
            <Check size={20} />
          </div>
          <div className="corner-note">
            Good things deserve
            <br />
            <em>a next chapter.</em>
          </div>
        </div>
      </section>
      <section className="steps-strip">
        <div>
          <span>01</span>
          <Camera />
          <strong>Snap your finds</strong>
          <p>One photo. Every little treasure.</p>
        </div>
        <div>
          <span>02</span>
          <Sparkles />
          <strong>Make it yours</strong>
          <p>Review names, prices, and quantities.</p>
        </div>
        <div>
          <span>03</span>
          <QrCode />
          <strong>Open for good</strong>
          <p>One QR code. A whole storefront.</p>
        </div>
      </section>
      <section className="green-note">
        <Leaf />
        <span>Less forgotten stuff. More second chances.</span>
        <span>Built for the next neighborhood sale.</span>
      </section>
      <footer>
        <Brand />
        <p>Good finds. New beginnings.</p>
        <a href="/studio">
          Seller dashboard <ArrowUpRight size={16} />
        </a>
      </footer>
    </main>
  );
}
