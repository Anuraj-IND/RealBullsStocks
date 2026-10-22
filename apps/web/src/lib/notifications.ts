import { signedInr, USD_INR } from "./money";
import { fmtMarket } from "./format";

export interface StructuredNotif {
  amountInr?: number;
  price?: number;
  quoteCurrency?: string;
}

export interface NotifLike {
  title: string;
  body: string | null;
  data?: StructuredNotif | null;
}

// Render a notification body in ₹ (pure — safe in WS callbacks).
// Prefers the structured payload; falls back to parsing the two legacy USD
// text patterns; returns null when nothing matches (caller shows raw body).
export function renderNotifBody(n: NotifLike, qc: Map<string, string>): string | null {
  const d = n.data;
  if (d?.amountInr !== undefined) return signedInr(d.amountInr);
  if (d?.price !== undefined) return fmtMarket(d.price, d.quoteCurrency);
  if (!n.body) return null;

  // Legacy pre-migration rows stored USD text — convert explicitly (the live
  // signedInr below is identity now that the ledger is ₹).
  const realized = /Realized ([+-]?[\d.,]+)/.exec(n.body);
  if (realized) {
    const v = parseFloat(realized[1]!.replace(/,/g, ""));
    if (Number.isFinite(v)) return signedInr(v * USD_INR);
  }
  const atPrice = /(?:@|now) ([\d.,]+)/.exec(n.body);
  if (atPrice) {
    const v = parseFloat(atPrice[1]!.replace(/,/g, ""));
    const parts = n.title.trim().split(/\s+/);
    // FILL titles end with the symbol ("Filled BUY 1 BTCUSDT"); ALERT
    // titles start with it ("BTCUSDT ABOVE ≥ …").
    const sym = n.title.startsWith("Filled") ? (parts.pop() ?? "") : (parts[0] ?? "");
    if (Number.isFinite(v) && sym) return fmtMarket(v, qc.get(sym.toUpperCase()));
  }
  return null;
}
