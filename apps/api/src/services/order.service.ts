import { Prisma, type Asset, type Position } from "@realbulls/db";
import {
  previewOrder,
  realizedPnl,
  unrealizedPnl,
  requiredMargin,
  liquidationPrice,
  evaluateRisk,
  marginLevel,
} from "@realbulls/engine";
import type { OrderSide, PlaceOrderInput } from "@realbulls/shared";
import { prisma } from "../lib/prisma.js";
import { D } from "../lib/money.js";
import { badRequest, notFound, unprocessable } from "../lib/errors.js";
import {
  getEffectiveConfig,
  resolveRisk,
  getExecutableQuote,
  executablePrice,
  getQuote,
  getQuoteForAsset,
  getBrokerage,
  brokerageForQty,
  isSegmentTradable,
  resolveAssetSegment,
  isDerivativeSegment,
  type EffectiveConfig,
  type RiskProfile,
} from "./market.service.js";
import { postLedgerChangesWithin } from "./ledger.service.js";
import { notifyAccountOwner } from "./notify.service.js";
import { isAssetMarketOpen } from "./market-status.service.js";

const OPPOSITE: Record<OrderSide, OrderSide> = { BUY: "SELL", SELL: "BUY" };

async function loadAsset(assetId: string): Promise<Asset> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw notFound("Asset not found");
  return asset;
}

async function accountUnrealized(accountId: string): Promise<number> {
  const positions = await prisma.position.findMany({ where: { accountId, status: "OPEN" } });
  let total = 0;
  for (const p of positions) {
    const asset = await prisma.asset.findUnique({ where: { id: p.assetId } });
    if (!asset) continue;
    const q = await getQuoteForAsset(asset);
    const mark = q?.mid ?? D.num(p.avgEntryPrice);
    total += unrealizedPnl({
      side: p.side as OrderSide,
      qty: D.num(p.qty),
      avgEntryPrice: D.num(p.avgEntryPrice),
      markPrice: mark,
      contractSize: D.num(asset.contractSize),
    });
  }
  return D.toMoney(total);
}


export interface PlaceOrderResult {
  orderId: string;
  positionId: string | null;
  status: string;
  fillPrice: number | null;
  marginUsed: number;
  commission: number;
}

export async function placeOrder(params: {
  accountId: string;
  tenantId: string;
  userId: string;
  input: PlaceOrderInput;
  createdBy?: string;
}): Promise<PlaceOrderResult> {
  const { accountId, tenantId, userId, input, createdBy } = params;

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.tenantId !== tenantId) throw notFound("Account not found");
  if (account.status === "CLOSED" || account.status === "LIQUIDATED") {
    throw badRequest("Account is not tradable");
  }

  if (input.idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      return {
        orderId: existing.id,
        positionId: existing.positionId,
        status: existing.status,
        fillPrice: existing.filledPrice ? D.num(existing.filledPrice) : null,
        marginUsed: 0,
        commission: 0,
      };
    }
  }

  const asset = await loadAsset(input.assetId);
  const config = await getEffectiveConfig(tenantId, asset);
  if (!config.enabled) throw badRequest("Asset disabled for this tenant", "ASSET_DISABLED");
  if (!(await isSegmentTradable(userId, tenantId, asset))) {
    throw badRequest("Trading is disabled for this market segment", "SEGMENT_DISABLED");
  }
  if (!(await isAssetMarketOpen(asset))) throw badRequest("Market is closed for this instrument", "MARKET_CLOSED");

  if (isDerivativeSegment(resolveAssetSegment(asset))) {
    if (input.qty < 1 - 1e-9) throw badRequest("Minimum quantity is 1 lot", "INVALID_LOT");
    if (Math.abs(input.qty - Math.round(input.qty)) > 1e-9) throw badRequest("Futures & options trade in whole lots", "INVALID_LOT");
  }

  const risk = await resolveRisk(userId, tenantId, asset, config);
  const leverage = risk.leverage;

  const quote = await getExecutableQuote(tenantId, asset, config);

  if (input.type === "LIMIT") {
    if (input.side === "BUY" && input.price! >= quote.ask) throw badRequest("A buy limit must be below the market price");
    if (input.side === "SELL" && input.price! <= quote.bid) throw badRequest("A sell limit must be above the market price");
  }
  if (input.type === "STOP") {
    if (input.side === "BUY" && input.triggerPrice! >= quote.bid) {
      throw badRequest("A stop-loss for a buy must be below the market price");
    }
    if (input.side === "SELL" && input.triggerPrice! <= quote.ask) {
      throw badRequest("A stop-loss for a sell must be above the market price");
    }
    const position = await prisma.position.findFirst({
      where: { accountId, assetId: asset.id, status: "OPEN", side: input.side },
    });
    if (!position) {
      throw badRequest(`No open ${input.side} position on ${asset.symbol} to protect`, "NO_POSITION");
    }
    await prisma.position.update({ where: { id: position.id }, data: { stopLoss: D.dec(input.triggerPrice!) } });
    return { orderId: position.id, positionId: position.id, status: "STOP_LOSS_SET", fillPrice: null, marginUsed: 0, commission: 0 };
  }

  if (input.type === "LIMIT") {
    const order = await prisma.order.create({
      data: {
        tenantId,
        accountId,
        assetId: asset.id,
        side: input.side,
        type: "LIMIT",
        qty: D.dec(input.qty),
        price: input.price !== undefined ? D.dec(input.price) : null,
        stopLoss: input.stopLoss !== undefined ? D.dec(input.stopLoss) : null,
        takeProfit: input.takeProfit !== undefined ? D.dec(input.takeProfit) : null,
        leverage,
        status: "PENDING",
        idempotencyKey: input.idempotencyKey,
      },
    });
    return { orderId: order.id, positionId: null, status: "PENDING", fillPrice: null, marginUsed: 0, commission: 0 };
  }

  const unrealized = await accountUnrealized(accountId);
  const contractSize = D.num(asset.contractSize);
  const isDerivative = isDerivativeSegment(resolveAssetSegment(asset));
  const brokerage = await getBrokerage(userId, config);
  const commissionPerLot = isDerivative ? brokerage.perLot : 0;
  const commissionPerOrder = isDerivative ? 0 : brokerage.perOrder;
  const preview = previewOrder({
    side: input.side,
    qty: input.qty,
    price: quote.mid,
    contractSize,
    leverage,
    commissionPerLot,
    commissionPerOrder,
    balance: D.num(account.balance),
    unrealizedPnl: unrealized,
    marginUsed: D.num(account.marginUsed),
    marginCallPct: risk.marginCallPct,
    stopOutPct: risk.stopOutPct,
  });

  if (!preview.affordable) {
    throw unprocessable(
      `Insufficient margin: need ${preview.requiredMargin.toFixed(2)} + ${preview.commission.toFixed(2)} fee`,
      "INSUFFICIENT_MARGIN",
    );
  }

  const SLIPPAGE = 0.0001;
  const fill = input.side === "BUY" ? quote.mid * (1 + SLIPPAGE) : quote.mid * (1 - SLIPPAGE);
  const margin = requiredMargin({ qty: input.qty, price: fill, contractSize, leverage });
  const liq = liquidationPrice({ side: input.side, avgEntryPrice: fill, leverage, stopOutPct: risk.stopOutPct });

  const result = await prisma.$transaction(async (tx) => {
    const position = await tx.position.create({
      data: {
        tenantId,
        accountId,
        assetId: asset.id,
        side: input.side,
        qty: D.dec(input.qty),
        avgEntryPrice: D.dec(fill),
        leverage,
        marginUsed: D.dec(margin),
        commission: D.dec(preview.commission),
        stopLoss: input.stopLoss !== undefined ? D.dec(input.stopLoss) : null,
        takeProfit: input.takeProfit !== undefined ? D.dec(input.takeProfit) : null,
        liquidationPrice: D.dec(liq),
        status: "OPEN",
      },
    });

    const order = await tx.order.create({
      data: {
        tenantId,
        accountId,
        assetId: asset.id,
        side: input.side,
        type: "MARKET",
        qty: D.dec(input.qty),
        price: D.dec(fill),
        leverage,
        status: "FILLED",
        filledPrice: D.dec(fill),
        filledQty: D.dec(input.qty),
        filledAt: new Date(),
        positionId: position.id,
        stopLoss: input.stopLoss !== undefined ? D.dec(input.stopLoss) : null,
        takeProfit: input.takeProfit !== undefined ? D.dec(input.takeProfit) : null,
        idempotencyKey: input.idempotencyKey,
      },
    });

    await tx.account.update({
      where: { id: accountId },
      data: { marginUsed: { increment: margin } },
    });

    await postLedgerChangesWithin(
      tx,
      accountId,
      [
        { type: "COMMISSION", delta: -preview.commission, refType: "ORDER", refId: order.id, memo: `Open brokerage ${asset.symbol}` },
        { type: "MARGIN_HOLD", delta: margin, auditOnly: true, refType: "POSITION", refId: position.id, memo: `Margin reserved ${asset.symbol}` },
      ],
      { createdBy },
    );

    return {
      orderId: order.id,
      positionId: position.id,
      status: "FILLED",
      fillPrice: fill,
      marginUsed: margin,
      commission: preview.commission,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await notifyAccountOwner(accountId, "FILL", `Filled ${input.side} ${input.qty} ${asset.symbol}`, `@ ${fill}`).catch(() => undefined);
  return result;
}


export interface CloseResult {
  positionId: string;
  closedQty: number;
  exitPrice: number;
  realizedPnl: number;
  fullyClosed: boolean;
}

export async function closePosition(params: {
  positionId: string;
  accountId: string;
  qty?: number;
  reason?: string;
  createdBy?: string;
  enforceHours?: boolean;
}): Promise<CloseResult> {
  const { positionId, accountId, qty, createdBy, enforceHours } = params;
  const position = await prisma.position.findUnique({ where: { id: positionId } });
  if (!position || position.accountId !== accountId) throw notFound("Position not found");
  if (position.status !== "OPEN") throw badRequest("Position is not open");

  const asset = await loadAsset(position.assetId);
  if (enforceHours && !(await isAssetMarketOpen(asset))) throw badRequest("Market is closed for this instrument", "MARKET_CLOSED");
  const config = await getEffectiveConfig(position.tenantId, asset);
  const posAccount = await prisma.account.findUnique({ where: { id: accountId }, select: { userId: true } });
  const brokerage = await getBrokerage(posAccount?.userId ?? "", config);
  const isDerivative = isDerivativeSegment(resolveAssetSegment(asset));
  const quote = await getExecutableQuote(position.tenantId, asset, config);
  const exitPrice = executablePrice(OPPOSITE[position.side as OrderSide], quote);

  const totalQty = D.num(position.qty);
  const closeQty = Math.min(qty ?? totalQty, totalQty);
  if (closeQty <= 0) throw badRequest("Close quantity must be positive");

  const contractSize = D.num(asset.contractSize);
  const pnl = D.toMoney(
    realizedPnl({
      side: position.side as OrderSide,
      qty: closeQty,
      entryPrice: D.num(position.avgEntryPrice),
      exitPrice,
      contractSize,
    }),
  );
  const commissionClose = D.toMoney(brokerageForQty(isDerivative, closeQty, brokerage));
  const releasedMargin = D.toMoney((D.num(position.marginUsed) * closeQty) / totalQty);
  const fullyClosed = closeQty >= totalQty - 1e-9;
  const remainingQty = D.toMoney(totalQty - closeQty);

  await prisma.$transaction(async (tx) => {
    if (fullyClosed) {
      await tx.position.update({
        where: { id: positionId },
        data: {
          status: "CLOSED",
          qty: D.dec(0),
          marginUsed: D.dec(0),
          realizedPnl: { increment: pnl },
          commission: { increment: commissionClose },
          closedAt: new Date(),
          closedPrice: D.dec(exitPrice),
        },
      });
    } else {
      await tx.position.update({
        where: { id: positionId },
        data: {
          qty: D.dec(remainingQty),
          marginUsed: D.dec(D.num(position.marginUsed) - releasedMargin),
          realizedPnl: { increment: pnl },
          commission: { increment: commissionClose },
        },
      });
    }

    const account = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
    const newUsed = Math.max(0, D.num(account.marginUsed) - releasedMargin);
    await tx.account.update({ where: { id: accountId }, data: { marginUsed: D.dec(newUsed) } });

    const changes = [
      {
        type: "REALIZED_PNL" as const,
        delta: pnl,
        refType: "POSITION",
        refId: positionId,
        memo: `Realized P&L ${asset.symbol}`,
      },
      ...(commissionClose > 0
        ? [{ type: "COMMISSION" as const, delta: -commissionClose, refType: "POSITION", refId: positionId, memo: `Close brokerage ${asset.symbol}` }]
        : []),
      { type: "MARGIN_RELEASE" as const, delta: releasedMargin, auditOnly: true, refType: "POSITION", refId: positionId, memo: `Margin released ${asset.symbol}` },
    ];

    await postLedgerChangesWithin(tx, accountId, changes, { createdBy });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  await notifyAccountOwner(accountId, "FILL", `Closed ${asset.symbol}`, `Realized ${pnl >= 0 ? "+" : ""}${pnl}`).catch(() => undefined);
  return { positionId, closedQty: closeQty, exitPrice, realizedPnl: pnl, fullyClosed };
}

export async function closeAllPositions(accountId: string, createdBy?: string, enforceHours = false): Promise<CloseResult[]> {
  const positions = await prisma.position.findMany({ where: { accountId, status: "OPEN" } });
  const results: CloseResult[] = [];
  for (const p of positions) {
    try {
      results.push(await closePosition({ positionId: p.id, accountId, createdBy, enforceHours }));
    } catch (err) {
      if ((err as { code?: string }).code === "MARKET_CLOSED") continue;
      throw err;
    }
  }
  return results;
}

export async function cancelOrder(orderId: string, accountId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.accountId !== accountId) throw notFound("Order not found");
  if (order.status !== "PENDING") throw badRequest("Only pending orders can be cancelled");
  await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });
}


export interface RiskCycleResult {
  accounts: number;
  fills: number;
  liquidations: number;
}


export async function runRiskCycle(): Promise<RiskCycleResult> {
  let fills = 0;
  let liquidations = 0;

  const openPositions = await prisma.position.findMany({ where: { status: "OPEN" } });
  const markedAccounts = new Set<string>();

  for (const position of openPositions) {
    const asset = await prisma.asset.findUnique({ where: { id: position.assetId } });
    if (!asset) continue;
    const q = await getQuote(asset.symbol);
    if (!q) continue;
    const pnl = D.toMoney(
      unrealizedPnl({
        side: position.side as OrderSide,
        qty: D.num(position.qty),
        avgEntryPrice: D.num(position.avgEntryPrice),
        markPrice: q.mid,
        contractSize: D.num(asset.contractSize),
      }),
    );
    await prisma.position.update({ where: { id: position.id }, data: { unrealizedPnl: D.dec(pnl) } });
    markedAccounts.add(position.accountId);
  }

  const pending = await prisma.order.findMany({ where: { status: "PENDING" } });
  for (const order of pending) {
    const asset = await prisma.asset.findUnique({ where: { id: order.assetId } });
    if (!asset) continue;
    const q = await getQuote(asset.symbol);
    if (!q) continue;
    if (shouldTrigger(order.type, order.side as OrderSide, D.num(order.price), D.num(order.triggerPrice), q)) {
      await fillPendingOrder(order.id);
      fills += 1;
    }
  }

  const positionsNow = await prisma.position.findMany({ where: { status: "OPEN" } });
  const byAccount = new Map<string, Position[]>();
  for (const p of positionsNow) {
    const list = byAccount.get(p.accountId) ?? [];
    list.push(p);
    byAccount.set(p.accountId, list);
  }

  for (const [accountId, positions] of byAccount) {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) continue;

    for (const p of positions) {
      const asset = await prisma.asset.findUnique({ where: { id: p.assetId } });
      if (!asset) continue;
      const q = await getQuote(asset.symbol);
      if (!q) continue;
      const hitSl =
        p.stopLoss !== null &&
        ((p.side === "BUY" && q.mid <= D.num(p.stopLoss)) || (p.side === "SELL" && q.mid >= D.num(p.stopLoss)));
      const hitTp =
        p.takeProfit !== null &&
        ((p.side === "BUY" && q.mid >= D.num(p.takeProfit)) || (p.side === "SELL" && q.mid <= D.num(p.takeProfit)));
      if (hitSl || hitTp) {
        await closePosition({ positionId: p.id, accountId, reason: hitSl ? "STOP_LOSS" : "TAKE_PROFIT", createdBy: "risk-engine" });
      }
    }

    const refreshed = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    const unrealized = await accountUnrealized(accountId);
    const eq = D.num(refreshed.balance) + unrealized;
    const used = D.num(refreshed.marginUsed);
    const asset0 = positions[0] ? await prisma.asset.findUnique({ where: { id: positions[0].assetId } }) : null;
    const config = asset0 ? await getEffectiveConfig(account.tenantId, asset0) : null;
    const risk = asset0 && config ? await resolveRisk(account.userId, account.tenantId, asset0, config) : { marginCallPct: 100, stopOutPct: 50 };
    const state = evaluateRisk({ equity: eq, marginUsed: used, marginCallPct: risk.marginCallPct, stopOutPct: risk.stopOutPct });

    if (state === "STOP_OUT") {
      await closeAllPositions(accountId, "liquidation-engine");
      await prisma.account.update({
        where: { id: accountId },
        data: { status: "LIQUIDATED", marginUsed: D.dec(0) },
      });
      await notifyAccountOwner(accountId, "MARGIN_CALL", "Account liquidated", "Stop-out level reached; all positions were closed.").catch(() => undefined);
      liquidations += 1;
    } else if (state === "MARGIN_CALL" && refreshed.status !== "MARGIN_CALL") {
      await prisma.account.update({ where: { id: accountId }, data: { status: "MARGIN_CALL" } });
      await notifyAccountOwner(accountId, "MARGIN_CALL", "Margin call", "Your margin level is low — consider closing positions or adding funds.").catch(() => undefined);
    } else if (state === "OK" && refreshed.status === "MARGIN_CALL") {
      await prisma.account.update({ where: { id: accountId }, data: { status: "ACTIVE" } });
    }
  }

  return { accounts: byAccount.size, fills, liquidations };
}

function shouldTrigger(
  type: string,
  side: OrderSide,
  price: number,
  trigger: number,
  q: { bid: number; ask: number; mid: number },
): boolean {
  if (type === "LIMIT") {
    if (!price) return false;
    return side === "BUY" ? q.ask <= price : q.bid >= price;
  }
  if (type === "STOP") {
    if (!trigger) return false;
    return side === "BUY" ? q.ask >= trigger : q.bid <= trigger;
  }
  return false;
}

async function fillPendingOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PENDING") return;
  const asset = await prisma.asset.findUnique({ where: { id: order.assetId } });
  if (!asset) return;
  const config = await getEffectiveConfig(order.tenantId, asset);
  const account = await prisma.account.findUnique({ where: { id: order.accountId } });
  if (!account) return;
  if (!(await isSegmentTradable(account.userId, order.tenantId, asset))) {
    await prisma.order.update({ where: { id: orderId }, data: { status: "REJECTED", rejectReason: "Trading disabled for this segment" } });
    return;
  }
  const isDerivative = isDerivativeSegment(resolveAssetSegment(asset));
  const brokerage = await getBrokerage(account.userId, config);

  let quote: Awaited<ReturnType<typeof getExecutableQuote>>;
  try {
    quote = await getExecutableQuote(order.tenantId, asset, config);
  } catch {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: "REJECTED", rejectReason: "No live price available at trigger" },
    });
    return;
  }
  const fill = executablePrice(order.side as OrderSide, quote);
  const qty = D.num(order.qty);
  const contractSize = D.num(asset.contractSize);
  const margin = requiredMargin({ qty, price: fill, contractSize, leverage: order.leverage });

  const unrealized = await accountUnrealized(order.accountId);
  const available = D.num(account.balance) + unrealized - D.num(account.marginUsed);
  if (available < margin) {
    await prisma.order.update({ where: { id: orderId }, data: { status: "REJECTED", rejectReason: "Insufficient margin at trigger" } });
    return;
  }

  const liq = liquidationPrice({ side: order.side as OrderSide, avgEntryPrice: fill, leverage: order.leverage });

  await prisma.$transaction(async (tx) => {
    const position = await tx.position.create({
      data: {
        tenantId: order.tenantId,
        accountId: order.accountId,
        assetId: order.assetId,
        side: order.side,
        qty: D.dec(qty),
        avgEntryPrice: D.dec(fill),
        leverage: order.leverage,
        marginUsed: D.dec(margin),
        commission: D.dec(D.toMoney(brokerageForQty(isDerivative, qty, brokerage))),
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        liquidationPrice: D.dec(liq),
        status: "OPEN",
      },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { status: "FILLED", filledPrice: D.dec(fill), filledQty: D.dec(qty), filledAt: new Date(), positionId: position.id },
    });
    await tx.account.update({ where: { id: order.accountId }, data: { marginUsed: { increment: margin } } });
    await postLedgerChangesWithin(tx, order.accountId, [
      { type: "COMMISSION", delta: -D.toMoney(brokerageForQty(isDerivative, qty, brokerage)), refType: "ORDER", refId: order.id, memo: `Open brokerage ${asset.symbol}` },
      { type: "MARGIN_HOLD", delta: margin, auditOnly: true, refType: "POSITION", refId: position.id, memo: `Margin reserved ${asset.symbol}` },
    ], { createdBy: "matching-engine" });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export { accountUnrealized, marginLevel, evaluateRisk, type EffectiveConfig, type RiskProfile };
