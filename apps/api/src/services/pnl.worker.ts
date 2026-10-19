import { unrealizedPnl, equity as computeEquity, freeMargin, marginLevel } from "@realbulls/engine";
import type { AccountSnapshot, OrderSide } from "@realbulls/shared";
import { prisma } from "../lib/prisma.js";
import { redis, accountChannel, getCachedPrice } from "../lib/redis.js";
import { D } from "../lib/money.js";
import { env } from "../env.js";
import { runRiskCycle } from "./order.service.js";

let timer: NodeJS.Timeout | null = null;

async function snapshotAccount(accountId: string): Promise<AccountSnapshot | null> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return null;

  const positions = await prisma.position.findMany({ where: { accountId, status: "OPEN" } });
  let unrealized = 0;
  for (const p of positions) {
    const asset = await prisma.asset.findUnique({ where: { id: p.assetId } });
    if (!asset) continue;
    const mid = (await getCachedPrice(asset.symbol)) ?? D.num(p.avgEntryPrice);
    unrealized += unrealizedPnl({
      side: p.side as OrderSide,
      qty: D.num(p.qty),
      avgEntryPrice: D.num(p.avgEntryPrice),
      markPrice: mid,
      contractSize: D.num(asset.contractSize),
    });
  }
  unrealized = D.toMoney(unrealized);
  const balance = D.num(account.balance);
  const used = D.num(account.marginUsed);
  const eq = D.toMoney(computeEquity(balance, unrealized));

  return {
    accountId,
    balance,
    equity: eq,
    marginUsed: used,
    marginFree: D.toMoney(freeMargin(eq, used)),
    marginLevel: Number.isFinite(marginLevel(eq, used)) ? D.toMoney(marginLevel(eq, used)) : 0,
    unrealizedPnl: unrealized,
    realizedPnl: 0,
    status: account.status,
    ts: Date.now(),
  };
}

async function tick(): Promise<void> {
  try {
    await runRiskCycle();
    const accounts = await prisma.account.findMany({ where: { isHouse: false }, select: { id: true } });
    await Promise.all(
      accounts.map(async ({ id }) => {
        const snap = await snapshotAccount(id);
        if (snap) await redis.publish(accountChannel(id), JSON.stringify(snap));
      }),
    );
  } catch (err) {
    console.error("[pnl.worker] tick failed", err);
  }
}


export function startPnlWorker(): void {
  if (timer) return;
  console.log(`[pnl.worker] started (${env.pnlTickMs}ms)`);
  timer = setInterval(() => void tick(), env.pnlTickMs);
}

export function stopPnlWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
