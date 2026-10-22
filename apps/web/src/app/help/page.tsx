import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Footer } from "@/components/ui/Footer";

export const metadata = {
  title: "Help Center",
  description: "Guides and answers for using the Realbulls trading terminal: orders, margin, positions, alerts, account and security.",
};

interface Section {
  id: string;
  title: string;
  items: Array<[string, string]>;
}

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      ["How do I sign in?", "Use the User ID (or email) and password issued by your administrator. Enter them on the sign-in page and you will be taken to the terminal."],
      ["I forgot my password", "Password resets are handled by your administrator from the Admin panel (Reset). Contact your account manager to have new credentials issued."],
      ["What can I trade?", "Forex, Crypto, Commodities, US equities, Indian equities and indices, plus Futures and Options where enabled for your account."],
    ],
  },
  {
    id: "trading",
    title: "Trading",
    items: [
      ["How do I place an order?", "Open the Terminal, select a symbol from the watchlist, choose Buy or Sell, set quantity and leverage, then confirm. The ticket shows required margin before you submit."],
      ["Which order types are available?", "Market, Limit and Stop orders. Attach Stop-Loss and Take-Profit levels from the advanced ticket."],
      ["How do I use the chart?", "Pick a timeframe (1m to 1h) and a style (Candles, Heikin Ashi or Line). Candles from 1 minute upward are persisted, so history is available on load."],
      ["What is the order book and Time & Sales?", "The Order Book shows simulated market depth around the mid price; Time & Sales lists recent prints. Both update in real time."],
    ],
  },
  {
    id: "margin",
    title: "Margin & leverage",
    items: [
      ["What does leverage mean?", "Leverage lets you control a larger position with less margin. At 1:10 a ₹1,00,000 position requires ₹10,000 margin; at 1:20 it requires ₹5,000."],
      ["How is required margin calculated?", "Required margin = (quantity × price × contract size) ÷ leverage. The order ticket shows this live, alongside your available margin."],
      ["What is the stop-out level?", "If your account margin level falls to the stop-out threshold (5%), the platform automatically closes positions to protect the account."],
      ["What are swaps?", "Positions held overnight may incur a swap / rollover charge, which is recorded in your ledger."],
    ],
  },
  {
    id: "positions",
    title: "Positions & risk",
    items: [
      ["Where do I see my positions?", "The Positions page lists open positions with live unrealised P&L, margin used and liquidation price, plus pending orders, history and the full ledger."],
      ["Can I modify Stop-Loss / Take-Profit?", "Yes. Use the SL/TP action on any open position, or modify a pending order before it triggers."],
      ["How do I close a trade?", "Close a single position, or use Close all to flatten the account. Partial closes are supported by entering a smaller quantity."],
    ],
  },
  {
    id: "alerts",
    title: "Alerts & notifications",
    items: [
      ["How do I set a price alert?", "Open Settings → Price alerts (or create one on a chart), pick the instrument, choose Above or Below and enter a price. You will be notified when it is reached."],
      ["How do I remove an alert or a notification?", "Alerts and notifications can be deleted individually. Hover an item and use the delete (×) control; notifications also support Clear all."],
    ],
  },
  {
    id: "account",
    title: "Account & security",
    items: [
      ["How do I change my password?", "Settings → Security. Enter your current password and a new one. For safety this signs out your other sessions."],
      ["Will I stay signed in?", "Yes. Sessions are remembered and access is refreshed automatically, so you are not asked to sign in again while your session is valid."],
      ["How is my account protected?", "All traffic is encrypted over HTTPS, passwords are hashed, login attempts are rate-limited, and refresh tokens rotate. Administrators can freeze accounts and audit activity."],
    ],
  },
  {
    id: "reports",
    title: "Reports & analytics",
    items: [
      ["Where can I see performance?", "The Analytics page shows win rate, profit factor, equity curve and maximum drawdown."],
      ["Can I export my data?", "Yes. Administrators can export the trade log and ledger as CSV from the Admin panel."],
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <Link href="/">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/" className="btn-ghost py-1.5 text-xs">
            Home
          </Link>
          <Link href="/login" className="btn-primary py-1.5 text-xs">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-10 px-4 py-10 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-6 space-y-1 text-sm">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Contents</div>
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block py-1 text-muted transition-colors hover:text-ink">
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-10">
          <header>
            <h1 className="font-display text-2xl font-bold">Help Center</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Everything you need to trade on Realbulls — from placing your first order to managing margin, alerts and
              security.
            </p>
          </header>

          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <h2 className="mb-3 text-lg font-semibold text-ink">{s.title}</h2>
              <div className="panel divide-y divide-line">
                {s.items.map(([q, a]) => (
                  <details key={q} className="group px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-ink">
                      {q}
                      <span className="text-muted transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <section className="panel p-5">
            <h2 className="text-lg font-semibold text-ink">Still need help?</h2>
            <p className="mt-2 text-sm text-muted">
              Contact your account manager or platform administrator. Administrators can reset passwords, adjust
              limits, grant funds and resolve account issues from the Admin panel.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
