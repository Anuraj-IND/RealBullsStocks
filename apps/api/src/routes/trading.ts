import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { placeOrderSchema, closePositionSchema, type OrderDTO, type OrderSide } from "@realbulls/shared";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../plugins/auth.js";
import { primaryAccount } from "../lib/accounts.js";
import { badRequest, notFound } from "../lib/errors.js";
import { placeOrder, closePosition, closeAllPositions, cancelOrder, accountUnrealized } from "../services/order.service.js";
import { getQuoteForAsset } from "../services/market.service.js";
import { toOrderDTO, toPositionDTO } from "../lib/serialize.js";
import { D } from "../lib/money.js";

export default async function tradingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  async function symbolFor(assetId: string): Promise<string> {
    const a = await prisma.asset.findUnique({ where: { id: assetId } });
    return a?.symbol ?? "?";
  }

  app.post("/orders", async (request, reply) => {
    const auth = request.auth!;
    const body = placeOrderSchema.parse(request.body);
    const account = body.accountId ? await prisma.account.findUnique({ where: { id: (body as { accountId?: string }).accountId } }) : await primaryAccount(auth.sub);
    if (!account || account.userId !== auth.sub) throw badRequest("Account not found");

    const result = await placeOrder({
      accountId: account.id,
      tenantId: auth.tenantId,
      userId: auth.sub,
      input: body,
      createdBy: auth.sub,
    });
    reply.code(201);
    return result;
  });

  app.get("/orders", async (request) => {
    const auth = request.auth!;
    const account = await primaryAccount(auth.sub);
    const [orders, positions] = await Promise.all([
      prisma.order.findMany({ where: { accountId: account.id, status: "PENDING" }, orderBy: { createdAt: "desc" } }),
      prisma.position.findMany({ where: { accountId: account.id, status: "OPEN" } }),
    ]);

    const real = await Promise.all(orders.map(async (o) => toOrderDTO(o, await symbolFor(o.assetId))));

    const virtual: OrderDTO[] = [];
    for (const p of positions) {
      const symbol = await symbolFor(p.assetId);
      const opposite: OrderSide = p.side === "BUY" ? "SELL" : "BUY";
      const base = {
        assetId: p.assetId,
        symbol,
        side: opposite,
        type: "STOP" as const,
        qty: D.num(p.qty),
        price: null,
        stopLoss: null,
        takeProfit: null,
        leverage: p.leverage,
        status: "PENDING" as const,
        filledPrice: null,
        filledQty: 0,
        rejectReason: null,
        createdAt: p.openedAt.toISOString(),
        filledAt: null,
      };
      if (p.stopLoss !== null) virtual.push({ id: `sl:${p.id}`, ...base, triggerPrice: D.num(p.stopLoss), kind: "SL" });
      if (p.takeProfit !== null) virtual.push({ id: `tp:${p.id}`, ...base, triggerPrice: D.num(p.takeProfit), kind: "TP" });
    }

    return { orders: [...virtual, ...real] };
  });

  app.get("/orders/history", async (request) => {
    const auth = request.auth!;
    const account = await primaryAccount(auth.sub);
    const orders = await prisma.order.findMany({
      where: { accountId: account.id, status: { in: ["FILLED", "CANCELLED", "REJECTED", "EXPIRED"] } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { orders: await Promise.all(orders.map(async (o) => toOrderDTO(o, await symbolFor(o.assetId)))) };
  });

  app.delete("/orders/:id", async (request) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };
    const account = await primaryAccount(auth.sub);

    if (id.startsWith("sl:") || id.startsWith("tp:")) {
      const [kind, positionId] = id.split(":");
      const pos = await prisma.position.findUnique({ where: { id: positionId! } });
      if (!pos || pos.accountId !== account.id) throw notFound("Position not found");
      await prisma.position.update({ where: { id: positionId! }, data: kind === "sl" ? { stopLoss: null } : { takeProfit: null } });
      return { ok: true };
    }

    await cancelOrder(id, account.id);
    return { ok: true };
  });

  const modifyOrderSchema = z.object({
    price: z.coerce.number().positive().optional(),
    triggerPrice: z.coerce.number().positive().optional(),
    stopLoss: z.coerce.number().positive().nullable().optional(),
    takeProfit: z.coerce.number().positive().nullable().optional(),
  });

  app.patch("/orders/:id", async (request) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };
    const body = modifyOrderSchema.parse(request.body);
    const account = await primaryAccount(auth.sub);
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || order.accountId !== account.id) throw notFound("Order not found");
    if (order.status !== "PENDING") throw badRequest("Only pending orders can be modified");
    await prisma.order.update({
      where: { id },
      data: {
        price: body.price !== undefined ? D.dec(body.price) : undefined,
        triggerPrice: body.triggerPrice !== undefined ? D.dec(body.triggerPrice) : undefined,
        stopLoss: body.stopLoss === undefined ? undefined : body.stopLoss === null ? null : D.dec(body.stopLoss),
        takeProfit: body.takeProfit === undefined ? undefined : body.takeProfit === null ? null : D.dec(body.takeProfit),
      },
    });
    return { ok: true };
  });

  const modifyPositionSchema = z.object({
    stopLoss: z.coerce.number().positive().nullable().optional(),
    takeProfit: z.coerce.number().positive().nullable().optional(),
  });

  app.patch("/positions/:id", async (request) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };
    const body = modifyPositionSchema.parse(request.body);
    const account = await primaryAccount(auth.sub);
    const pos = await prisma.position.findUnique({ where: { id } });
    if (!pos || pos.accountId !== account.id) throw notFound("Position not found");
    if (pos.status !== "OPEN") throw badRequest("Position is not open");
    await prisma.position.update({
      where: { id },
      data: {
        stopLoss: body.stopLoss === undefined ? undefined : body.stopLoss === null ? null : D.dec(body.stopLoss),
        takeProfit: body.takeProfit === undefined ? undefined : body.takeProfit === null ? null : D.dec(body.takeProfit),
      },
    });
    return { ok: true };
  });

  app.get("/positions", async (request) => {
    const auth = request.auth!;
    const account = await primaryAccount(auth.sub);
    const positions = await prisma.position.findMany({ where: { accountId: account.id, status: "OPEN" }, orderBy: { openedAt: "desc" } });
    const out = [];
    for (const p of positions) {
      const asset = await prisma.asset.findUnique({ where: { id: p.assetId } });
      const quote = asset ? await getQuoteForAsset(asset) : null;
      out.push(toPositionDTO(p, asset?.symbol ?? "?", quote?.mid));
    }
    const unrealized = await accountUnrealized(account.id);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [pnlRows, commRows] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: { accountId: account.id, type: "REALIZED_PNL", createdAt: { gte: startOfDay } },
        select: { direction: true, amount: true },
      }),
      prisma.ledgerEntry.findMany({
        where: { accountId: account.id, type: "COMMISSION", createdAt: { gte: startOfDay } },
        select: { amount: true },
      }),
    ]);
    const realizedToday = pnlRows.reduce((a, r) => a + (r.direction === "CREDIT" ? D.num(r.amount) : -D.num(r.amount)), 0);
    const commissionToday = commRows.reduce((a, r) => a + D.num(r.amount), 0);
    const dayPnl = D.toMoney(realizedToday - commissionToday + unrealized);

    return {
      positions: out,
      summary: {
        unrealizedPnl: unrealized,
        realizedToday: D.toMoney(realizedToday - commissionToday),
        dayPnl,
        marginUsed: D.num(account.marginUsed),
        balance: D.num(account.balance),
        equity: D.toMoney(D.num(account.balance) + unrealized),
      },
    };
  });

  app.get("/positions/history", async (request) => {
    const auth = request.auth!;
    const account = await primaryAccount(auth.sub);
    const positions = await prisma.position.findMany({
      where: { accountId: account.id, status: { in: ["CLOSED", "LIQUIDATED"] } },
      orderBy: { closedAt: "desc" },
      take: 200,
    });
    return { positions: await Promise.all(positions.map(async (p) => toPositionDTO(p, await symbolFor(p.assetId)))) };
  });

  app.post("/positions/:id/close", async (request) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };
    const body = closePositionSchema.parse(request.body ?? {});
    const account = await primaryAccount(auth.sub);
    return closePosition({ positionId: id, accountId: account.id, qty: body.qty, createdBy: auth.sub, enforceHours: true });
  });

  app.post("/positions/close-all", async (request) => {
    const auth = request.auth!;
    const account = await primaryAccount(auth.sub);
    const results = await closeAllPositions(account.id, auth.sub, true);
    return { closed: results.length, results };
  });
}
