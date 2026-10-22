import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Footer } from "@/components/ui/Footer";
import { BackgroundPaths } from "@/components/ui/background-paths";

const MARKETS = ["Forex", "Crypto", "Commodities", "US Stocks", "NSE / BSE", "Futures", "Options"];

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.example.com";
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "Realbulls", url: SITE, logo: `${SITE}/brand/logo.png` },
    { "@type": "WebSite", name: "Realbulls", url: SITE },
    {
      "@type": "SoftwareApplication",
      name: "Realbulls",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description:
        "Multi-asset trading terminal with real-time charts, market depth, margin calculator, analytics and a full ledger.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    },
  ],
};

export default function Home() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/help" className="btn-ghost py-1.5 text-xs">
            Help
          </Link>
          <Link href="/login" className="btn-primary py-1.5 text-xs">
            Sign in
          </Link>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6">
        <BackgroundPaths />
        <div className="relative z-10 w-full max-w-2xl text-center">
          <img src="/brand/logo.svg" alt="Realbulls" className="mx-auto h-16 w-auto" />
          <div className="font-display mt-4 text-3xl font-black tracking-tight">
            <span className="text-accent">REAL</span>
            <span className="text-green">BULLS</span>
          </div>

          <h1 className="mt-10 text-2xl font-semibold tracking-tight text-ink">Multi-asset trading terminal</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted">
            Real-time charts, market depth, a smart order ticket with live margin, and a full ledger across global
            markets.
          </p>

          <div className="mt-8">
            <Link href="/login" className="btn-primary px-6 py-2.5 text-sm">
              Sign in
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted">
            {MARKETS.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
