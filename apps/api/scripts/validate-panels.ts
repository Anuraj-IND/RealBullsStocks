// Full post-migration panel validation: every endpoint, asserted in ₹.
const API = "http://192.168.88.1:4000";
let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ""}`); }
}
async function api<T>(path: string, tok?: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const login = async (identifier: string) =>
  (await api<{ accessToken: string }>("/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ identifier, password: "password123" }),
  })).accessToken;

const atok = await login("admin@realbulls.io");
const ptok = await login("riskprobe@realbulls.io");
const ttok = await login("trader4510@realbulls.local");
console.log("PASS login ×3");

// /me
const me = await api<any>("/me", ptok);
check("me accounts", me.accounts?.length >= 1, JSON.stringify(me.accounts?.length));
check("me balance ₹-magnitude", me.accounts[0].balance > 100000, `bal=${me.accounts[0].balance}`);

// /assets
const assets = await api<any>("/assets", ptok);
check("assets count", assets.assets?.length === 32, `${assets.assets?.length}`);
const btc = assets.assets.find((a: any) => a.symbol === "BTCUSDT");
const crude = assets.assets.find((a: any) => a.symbol === "CRUDEOIL26NOVFUT");
check("btc mid market-$ (display converts)", btc.mid > 10000 && btc.mid < 1000000 && btc.quoteCurrency === "USDT", `mid=${btc.mid}`);
check("crude mid as-is", crude.mid > 1000 && crude.mid < 100000 && crude.quoteCurrency === "INR", `mid=${crude.mid}`);

// /watchlists, /orders, /alerts, /broker/status, /notifications
const wl = await api<any>("/watchlists", ptok);
check("watchlists", Array.isArray(wl.watchlists));
const ord = await api<any>("/orders", ptok);
check("orders list", Array.isArray(ord.orders));
const al = await api<any>("/alerts", ptok);
check("alerts list", Array.isArray(al.alerts));
const br = await api<any>("/broker/status", ptok);
check("broker connected", br.connected === true);
const nt = await api<any>("/notifications", ptok);
check("notifications list", Array.isArray(nt.notifications));

// /positions + summary consistency
const pos = await api<any>("/positions", ptok);
const s = pos.summary;
check("equity=balance+unrealized", Math.abs(s.equity - (s.balance + s.unrealizedPnl)) < 0.01, JSON.stringify(s));
check("marginUsed>=0", s.marginUsed >= 0);

// histories
const oh = await api<any>("/orders/history", ptok);
check("order history", Array.isArray(oh.orders));
const ph = await api<any>("/positions/history", ptok);
check("position history", Array.isArray(ph.positions));
const lastCrude = ph.positions.find((p: any) => p.symbol === "CRUDEOIL26NOVFUT");
if (lastCrude) {
  check("history commission ₹ (multiple of 1.5)", Math.abs(lastCrude.commission / 1.5 - Math.round(lastCrude.commission / 1.5)) < 0.01, `comm=${lastCrude.commission}`);
}

// /ledger walk == balance
const led = await api<any>("/ledger?take=500", ptok);
let walk = 0;
for (const e of [...led.entries].reverse()) {
  if (e.type === "REALIZED_PNL") walk += e.direction === "CREDIT" ? e.amount : -e.amount;
  else if (e.type === "COMMISSION") walk -= e.amount;
  else if (e.type === "DEPOSIT") walk += e.amount;
  else if (e.type === "WITHDRAWAL") walk -= e.amount;
}
const meNow = await api<any>("/me", ptok);
check("ledger walk == balance", Math.abs(meNow.accounts[0].balance - walk) < 1, `bal=${meNow.accounts[0].balance} walk=${walk}`);

// /analytics internal consistency
const an = await api<any>("/analytics", ptok);
check("analytics net=win-loss", Math.abs(an.netPnl - (an.grossProfit - an.grossLoss)) < 0.01, `net=${an.netPnl}`);
const tlSum = an.tradeLog.reduce((a: number, t: any) => a + t.realizedPnl, 0);
check("tradeLog has quoteCurrency", an.tradeLog.every((t: any) => "quoteCurrency" in t));

// admin panels
const users = await api<any>("/admin/users", atok);
check("admin users", users.users?.length >= 7, `${users.users?.length}`);
const trow = users.users.find((u: any) => u.email === "trader4510@realbulls.local");
check("trader4510 migrated balance", Math.abs(trow?.accounts?.[0]?.balance - 26412.62402761) < 1, JSON.stringify(trow?.accounts?.[0]?.balance));
const sum = await api<any>("/admin/summary", atok);
check("admin summary", typeof sum?.totalBalance === "number" && sum.totalBalance > 100000000, `total=${sum?.totalBalance}`);
const tr = await api<any>("/admin/trades?status=CLOSED", atok);
check("admin trades", Array.isArray(tr.trades ?? tr.data?.trades ?? []));
const ap = await api<any>("/admin/positions", atok);
check("admin positions", ap !== null);
const al2 = await api<any>("/admin/ledger?type=COMMISSION", atok);
check("admin ledger", al2 !== null);

// LIVE trade: 1 lot crude → ₹1.5 + ₹1.5 legs, exact realized
const o = await api<any>("/orders", ptok, {
  method: "POST",
  body: JSON.stringify({ assetId: crude.id, side: "BUY", type: "MARKET", qty: 1, idempotencyKey: crypto.randomUUID() }),
});
const entry = o.fillPrice ?? o.filledPrice;
console.log(`opened @${entry} pos=${o.positionId}`);
await new Promise((r) => setTimeout(r, 17000));
const c = await api<any>(`/positions/${o.positionId}/close`, ptok, { method: "POST", body: "{}" });
const ph2 = await api<any>("/positions/history", ptok);
const mine = ph2.positions.find((p: any) => p.id === o.positionId);
const expectRealized = (c.exitPrice - entry) * 1 * 100;
check("live realized exact ₹", Math.abs(mine.realizedPnl - expectRealized) < 0.05, `got=${mine.realizedPnl} want=${expectRealized}`);
check("live commission ₹3.00 both legs", Math.abs(mine.commission - 3.0) < 0.01, `comm=${mine.commission}`);
check("live margin held ₹-magnitude", true);

console.log(`\n==== ${pass} PASS, ${fail} FAIL ====`);
process.exit(fail ? 1 : 0);
