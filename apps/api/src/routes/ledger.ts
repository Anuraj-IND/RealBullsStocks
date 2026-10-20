import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../plugins/auth.js";
import { primaryAccount } from "../lib/accounts.js";
import { toLedgerDTO } from "../lib/serialize.js";
import { D } from "../lib/money.js";
import { filledQtyByPosition } from "../lib/positions.js";

export default async function ledgerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/ledger", async (request) => {
    const auth = request.auth!;
    const account = await primaryAccount(auth.sub);
    const query = request.query as { take?: string; type?: string };
    const take = Math.min(Number(query.take ?? 100), 500);
    const entries = await prisma.ledgerEntry.findMany({
      where: { accountId: account.id, ...(query.type ? { type: query.type as never } : {}) },
      orderBy: { createdAt: "desc" },
      take,
    });
    return { entries: entries.map(toLedgerDTO) };
  });

  app.get("/analytics", async (request) => {
    const auth = request.auth!;
    const account = await primaryAccount(auth.sub);

    const closed = await prisma.position.findMany({
      where: { accountId: account.id, status: { in: ["CLOSED", "LIQUIDATED"] } },
      orderBy: { closedAt: "asc" },
    });
    const originalQty = await filledQtyByPosition(closed.map((p) => p.id));

    let wins = 0;
    let losses = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let cum = D.num(account.balance);
    let peak = cum;
    let maxDrawdown = 0;
    const equityCurve: Array<{ time: string; equity: number }> = [];

    for (const p of closed) {
      const pnl = D.num(p.realizedPnl);
      cum += pnl;
      if (pnl > 0) {
        wins += 1;
        grossWin += pnl;
      } else if (pnl < 0) {
        losses += 1;
        grossLoss += Math.abs(pnl);
      }
      peak = Math.max(peak, cum);
      maxDrawdown = Math.max(maxDrawdown, peak - cum);
      equityCurve.push({ time: (p.closedAt ?? p.openedAt).toISOString(), equity: D.toMoney(cum) });
    }

    const total = wins + losses;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

    const dailyMap = new Map<string, { pnl: number; trades: number }>();
    for (const p of closed) {
      const day = (p.closedAt ?? p.openedAt).toISOString().slice(0, 10);
      const cur = dailyMap.get(day) ?? { pnl: 0, trades: 0 };
      cur.pnl += D.num(p.realizedPnl);
      cur.trades += 1;
      dailyMap.set(day, cur);
    }
    const dailyPnl = Array.from(dailyMap.entries())
      .map(([date, v]) => ({ date, pnl: D.toMoney(v.pnl), trades: v.trades }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      winRate: total > 0 ? D.toMoney((wins / total) * 100) : 0,
      totalTrades: total,
      wins,
      losses,
      netPnl: D.toMoney(grossWin - grossLoss),
      grossProfit: D.toMoney(grossWin),
      grossLoss: D.toMoney(grossLoss),
      profitFactor: Number.isFinite(profitFactor) ? D.toMoney(profitFactor) : null,
      maxDrawdown: D.toMoney(maxDrawdown),
      equityCurve,
      dailyPnl,
      tradeLog: closed.slice(-50).reverse().map((p) => ({
        id: p.id,
        side: p.side,
        qty: originalQty.get(p.id) ?? D.num(p.qty),
        entry: D.num(p.avgEntryPrice),
        exit: p.closedPrice ? D.num(p.closedPrice) : null,
        realizedPnl: D.num(p.realizedPnl),
        openedAt: p.openedAt.toISOString(),
        closedAt: p.closedAt?.toISOString() ?? null,
      })),
    };
  });
}
