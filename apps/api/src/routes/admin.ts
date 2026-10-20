import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  adminAdjustSchema,
  leverageUpdateSchema,
  userLeverageSchema,
  leverageSegmentsSchema,
  assetConfigSchema,
} from "@realbulls/shared";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../plugins/auth.js";
import { forbidden, notFound, badRequest } from "../lib/errors.js";
import { hashPassword } from "../lib/password.js";
import { slugBase, uniqueUsername } from "../lib/usernames.js";
import { postLedgerChanges } from "../services/ledger.service.js";
import { getQuote } from "../services/market.service.js";
import { closePosition } from "../services/order.service.js";
import { D } from "../lib/money.js";
import { filledQtyByPosition } from "../lib/positions.js";

const canAdmin = ["SUPER_ADMIN", "TENANT_ADMIN"] as const;

const SEG_ENUM = z.enum([
  "EQUITY",
  "FOREX",
  "CRYPTO",
  "COMMODITY",
  "INDEX_FUTURES",
  "INDEX_OPTIONS",
  "STOCK_FUTURES",
  "STOCK_OPTIONS",
]);

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRole(...canAdmin));

  
  function tenantScope(request: { auth?: { role: string; tenantId: string } }, requested?: string | null): string | null {
    const auth = request.auth!;
    if (auth.role === "SUPER_ADMIN") return requested ?? null;
    if (requested && requested !== auth.tenantId) throw forbidden("Cross-tenant access denied");
    return auth.tenantId;
  }

  
  async function segmentMapFor(userIds: string[]): Promise<Map<string, Record<string, number>>> {
    const overrides = await prisma.userLeverageOverride.findMany({
      where: { userId: { in: userIds }, assetId: null, assetClass: null, segment: { not: null } },
    });
    const map = new Map<string, Record<string, number>>();
    for (const o of overrides) {
      if (!o.segment) continue;
      const m = map.get(o.userId) ?? {};
      m[o.segment] = o.leverage;
      map.set(o.userId, m);
    }
    return map;
  }

  app.get("/admin/users", async (request) => {
    const query = request.query as { tenantId?: string; q?: string };
    const tenantId = tenantScope(request, query.tenantId);
    const users = await prisma.user.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        email: { not: { endsWith: ".internal" } },
        ...(query.q
          ? {
              OR: [
                { email: { contains: query.q, mode: "insensitive" } },
                { username: { contains: query.q, mode: "insensitive" } },
                { displayName: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { accounts: { where: { isHouse: false } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const segMap = await segmentMapFor(users.map((u) => u.id));

    const accountIds = users.flatMap((u) => u.accounts.map((a) => a.id));
    const [positionAgg, commissionAgg] = await Promise.all([
      prisma.position.groupBy({
        by: ["accountId", "status"],
        where: { accountId: { in: accountIds } },
        _sum: { realizedPnl: true, unrealizedPnl: true },
        _count: { _all: true },
      }),
      prisma.ledgerEntry.groupBy({
        by: ["accountId"],
        where: { accountId: { in: accountIds }, type: "COMMISSION", direction: "DEBIT" },
        _sum: { amount: true },
      }),
    ]);

    type PnlAcc = { realized: number; unrealized: number; commission: number; trades: number; openTrades: number };
    const pnlByAccount = new Map<string, PnlAcc>();
    const accFor = (accountId: string): PnlAcc => {
      let acc = pnlByAccount.get(accountId);
      if (!acc) {
        acc = { realized: 0, unrealized: 0, commission: 0, trades: 0, openTrades: 0 };
        pnlByAccount.set(accountId, acc);
      }
      return acc;
    };
    for (const row of positionAgg) {
      const acc = accFor(row.accountId);
      acc.realized += D.num(row._sum.realizedPnl);
      acc.trades += row._count._all;
      if (row.status === "OPEN") {
        acc.unrealized += D.num(row._sum.unrealizedPnl);
        acc.openTrades += row._count._all;
      }
    }
    for (const row of commissionAgg) accFor(row.accountId).commission += D.num(row._sum.amount);

    return {
      users: users.map((u) => {
        const pnl = { realized: 0, unrealized: 0, commission: 0, net: 0, trades: 0, openTrades: 0 };
        let balance = 0;
        let marginUsed = 0;
        for (const a of u.accounts) {
          balance += D.num(a.balance);
          marginUsed += D.num(a.marginUsed);
          const acc = pnlByAccount.get(a.id);
          if (!acc) continue;
          pnl.realized += acc.realized;
          pnl.unrealized += acc.unrealized;
          pnl.commission += acc.commission;
          pnl.trades += acc.trades;
          pnl.openTrades += acc.openTrades;
        }
        pnl.net = pnl.realized + pnl.unrealized - pnl.commission;
        return {
          id: u.id,
          tenantId: u.tenantId,
          email: u.email,
          username: u.username,
          role: u.role,
          status: u.status,
          displayName: u.displayName,
          lastLoginIp: u.lastLoginIp,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          segments: segMap.get(u.id) ?? {},
          brokerage: u.commissionPerLotOverride != null ? D.num(u.commissionPerLotOverride) : null,
          brokeragePerOrder: u.commissionPerOrderOverride != null ? D.num(u.commissionPerOrderOverride) : null,
          allowedSegments: u.allowedSegments,
          balance: D.toMoney(balance),
          marginUsed: D.toMoney(marginUsed),
          pnl: {
            realized: D.toMoney(pnl.realized),
            unrealized: D.toMoney(pnl.unrealized),
            commission: D.toMoney(pnl.commission),
            net: D.toMoney(pnl.net),
            trades: pnl.trades,
            openTrades: pnl.openTrades,
          },
          accounts: u.accounts.map((a) => ({
            id: a.id,
            type: a.type,
            balance: D.num(a.balance),
            marginUsed: D.num(a.marginUsed),
            status: a.status,
          })),
        };
      }),
    };
  });

  const patchUserSchema = z.object({
    status: z.enum(["ACTIVE", "SUSPENDED", "PENDING"]).optional(),
    role: z.enum(["SUPER_ADMIN", "TENANT_ADMIN", "TRADER"]).optional(),
    displayName: z.string().min(1).max(80).optional(),
    commissionPerLot: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
    commissionPerOrder: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
    allowedSegments: z.array(SEG_ENUM).optional(),
  });

  app.patch("/admin/users/:id", async (request) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };
    const body = patchUserSchema.parse(request.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound("User not found");
    if (target.displayName === "HOUSE") throw forbidden("System account is not editable");
    tenantScope(request, target.tenantId);

    if ((body.role === "SUPER_ADMIN" || target.role === "SUPER_ADMIN") && auth.role !== "SUPER_ADMIN") {
      throw forbidden("Only a super admin can manage super admins");
    }
    if (id === auth.sub && (body.status === "SUSPENDED" || (body.role && body.role !== auth.role))) {
      throw badRequest("You cannot suspend or demote your own account");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        status: body.status,
        role: body.role,
        displayName: body.displayName,
        commissionPerLotOverride:
          body.commissionPerLot === undefined ? undefined : body.commissionPerLot === null ? null : D.dec(body.commissionPerLot),
        commissionPerOrderOverride:
          body.commissionPerOrder === undefined ? undefined : body.commissionPerOrder === null ? null : D.dec(body.commissionPerOrder),
        allowedSegments: body.allowedSegments,
      },
    });
    await prisma.auditLog.create({
      data: { tenantId: target.tenantId, actorId: auth.sub, action: "USER_UPDATE", targetType: "User", targetId: id, after: body, ip: request.ip },
    });
    return { id: updated.id, status: updated.status, role: updated.role, brokerage: updated.commissionPerLotOverride != null ? D.num(updated.commissionPerLotOverride) : null, brokeragePerOrder: updated.commissionPerOrderOverride != null ? D.num(updated.commissionPerOrderOverride) : null, allowedSegments: updated.allowedSegments };
  });

  const createUserSchema = z.object({
    name: z.string().min(1).max(80),
    email: z.string().email().optional(),
    username: z.string().min(3).max(40).optional(),
    password: z.string().min(6).optional(),
    role: z.enum(["SUPER_ADMIN", "TENANT_ADMIN", "TRADER"]).default("TRADER"),
    tenantId: z.string().optional(),
    startingBalance: z.coerce.number().min(0).optional(),
  });

  app.post("/admin/users", async (request, reply) => {
    const auth = request.auth!;
    const body = createUserSchema.parse(request.body);

    let tenantId: string | null;
    if (auth.role === "SUPER_ADMIN") {
      tenantId = body.tenantId ?? (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }))?.id ?? null;
    } else {
      if (body.role === "SUPER_ADMIN") throw forbidden("Only a super admin can create super admins");
      tenantId = tenantScope(request, body.tenantId ?? null);
    }
    if (!tenantId) throw badRequest("No tenant available");

    const username = body.username ?? (await uniqueUsername(tenantId, slugBase(body.name)));
    const email = body.email ?? `${username}@realbulls.local`;

    const existingEmail = await prisma.user.findUnique({ where: { tenantId_email: { tenantId, email } } });
    if (existingEmail) throw badRequest("A user with this email already exists in this tenant");
    const existingUsername = await prisma.user.findUnique({ where: { tenantId_username: { tenantId, username } } });
    if (existingUsername) throw badRequest("This user id already exists");

    const password = body.password ?? `rb-${Math.random().toString(36).slice(2, 10)}`;
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: { tenantId, email, username, passwordHash, role: body.role, displayName: body.name, status: "ACTIVE" },
    });
    const account = await prisma.account.create({
      data: { userId: user.id, tenantId, type: "DEMO", baseCurrency: "USD", balance: 0, isPrimary: true },
    });
    if ((body.startingBalance ?? 0) > 0) {
      await postLedgerChanges(account.id, [{ type: "DEPOSIT", delta: body.startingBalance!, memo: "Initial balance (admin)" }], { createdBy: auth.sub });
    }
    await prisma.watchlist.create({ data: { userId: user.id, name: "Default" } });
    await prisma.auditLog.create({
      data: { tenantId, actorId: auth.sub, action: "USER_CREATE", targetType: "User", targetId: user.id, after: { name: body.name, username, role: body.role }, ip: request.ip },
    });

    reply.code(201);
    return { id: user.id, name: user.displayName, username: user.username, email: user.email, role: user.role, accountId: account.id, password };
  });

  app.get("/admin/admins", async (request) => {
    const query = request.query as { tenantId?: string; q?: string };
    const tenantId = tenantScope(request, query.tenantId);
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ["SUPER_ADMIN", "TENANT_ADMIN"] },
        ...(tenantId ? { tenantId } : {}),
        ...(query.q
          ? {
              OR: [
                { email: { contains: query.q, mode: "insensitive" } },
                { username: { contains: query.q, mode: "insensitive" } },
                { displayName: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { accounts: { where: { isHouse: false } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    const segMap = await segmentMapFor(admins.map((u) => u.id));
    return {
      admins: admins.map((u) => ({
        id: u.id,
        tenantId: u.tenantId,
        email: u.email,
        username: u.username,
        role: u.role,
        status: u.status,
        displayName: u.displayName,
        lastLoginIp: u.lastLoginIp,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        segments: segMap.get(u.id) ?? {},
        brokerage: u.commissionPerLotOverride != null ? D.num(u.commissionPerLotOverride) : null,
        brokeragePerOrder: u.commissionPerOrderOverride != null ? D.num(u.commissionPerOrderOverride) : null,
        allowedSegments: u.allowedSegments,
        accounts: u.accounts.map((a) => ({
          id: a.id,
          type: a.type,
          balance: D.num(a.balance),
          marginUsed: D.num(a.marginUsed),
          status: a.status,
        })),
      })),
    };
  });

  app.get("/admin/trades", async (request) => {
    const query = request.query as { tenantId?: string; userId?: string; status?: string; take?: string };
    const tenantId = tenantScope(request, query.tenantId);
    const take = Math.min(Number(query.take ?? 200), 500);
    const statuses =
      query.status === "OPEN"
        ? ["OPEN"]
        : query.status === "LIQUIDATED"
          ? ["LIQUIDATED"]
          : query.status === "ALL"
            ? ["OPEN", "CLOSED", "LIQUIDATED"]
            : ["CLOSED", "LIQUIDATED"];

    const trades = await prisma.position.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(query.userId ? { account: { userId: query.userId } } : {}),
        status: { in: statuses as never },
      },
      include: { asset: true, account: { include: { user: true } } },
      orderBy: { updatedAt: "desc" },
      take,
    });

    const originalQty = await filledQtyByPosition(
      trades.filter((p) => p.status !== "OPEN").map((p) => p.id),
    );

    const summary = trades.reduce(
      (acc, p) => {
        acc.realizedPnl += D.num(p.realizedPnl);
        acc.commission += D.num(p.commission);
        acc.margin += D.num(p.marginUsed);
        return acc;
      },
      { realizedPnl: 0, commission: 0, margin: 0 },
    );

    return {
      summary: {
        count: trades.length,
        realizedPnl: D.toMoney(summary.realizedPnl),
        commission: D.toMoney(summary.commission),
        openMargin: D.toMoney(summary.margin),
      },
      trades: trades.map((p) => ({
        id: p.id,
        email: p.account.user.email,
        symbol: p.asset.symbol,
        assetClass: p.asset.assetClass,
        side: p.side,
        qty: p.status === "OPEN" ? D.num(p.qty) : (originalQty.get(p.id) ?? D.num(p.qty)),
        leverage: p.leverage,
        entry: D.num(p.avgEntryPrice),
        exit: p.closedPrice ? D.num(p.closedPrice) : null,
        marginUsed: D.num(p.marginUsed),
        commission: D.num(p.commission),
        realizedPnl: D.num(p.realizedPnl),
        unrealizedPnl: D.num(p.unrealizedPnl),
        status: p.status,
        openedAt: p.openedAt.toISOString(),
        closedAt: p.closedAt?.toISOString() ?? null,
      })),
    };
  });

  app.get("/admin/ledger", async (request) => {
    const query = request.query as { tenantId?: string; accountId?: string; type?: string; take?: string };
    const tenantId = tenantScope(request, query.tenantId);
    const take = Math.min(Number(query.take ?? 150), 500);
    const entries = await prisma.ledgerEntry.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(query.accountId ? { accountId: query.accountId } : {}),
        ...(query.type ? { type: query.type as never } : {}),
        account: { isHouse: false },
      },
      include: { account: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
    return {
      entries: entries.map((e) => ({
        id: e.id,
        email: e.account.user.email,
        accountId: e.accountId,
        direction: e.direction,
        type: e.type,
        amount: D.num(e.amount),
        balanceAfter: D.num(e.balanceAfter),
        refType: e.refType,
        refId: e.refId,
        memo: e.memo,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });

  const resetPasswordSchema = z.object({ password: z.string().min(6).optional() });

  app.post("/admin/users/:id/reset-password", async (request) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };
    const body = resetPasswordSchema.parse(request.body ?? {});
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound("User not found");
    if (target.displayName === "HOUSE") throw forbidden("System account is not editable");
    tenantScope(request, target.tenantId);
    if ((target.role === "SUPER_ADMIN" || target.role === "TENANT_ADMIN") && auth.role !== "SUPER_ADMIN") {
      throw forbidden("Only a super admin can reset an admin password");
    }
    const password = body.password ?? `rb-${Math.random().toString(36).slice(2, 10)}`;
    await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
    await prisma.auditLog.create({
      data: { tenantId: target.tenantId, actorId: auth.sub, action: "PASSWORD_RESET", targetType: "User", targetId: id, ip: request.ip },
    });
    return { id, name: target.displayName, username: target.username, email: target.email, role: target.role, password };
  });

  app.get("/admin/users/:id/detail", async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { tradeStatus?: string; tradeTake?: string; orderTake?: string };
    const user = await prisma.user.findUnique({ where: { id }, include: { accounts: { where: { isHouse: false } } } });
    if (!user || user.displayName === "HOUSE") throw notFound("User not found");
    tenantScope(request, user.tenantId);

    const accountIds = user.accounts.map((a) => a.id);
    const statuses =
      query.tradeStatus === "OPEN"
        ? ["OPEN"]
        : query.tradeStatus === "CLOSED"
          ? ["CLOSED", "LIQUIDATED"]
          : query.tradeStatus === "LIQUIDATED"
            ? ["LIQUIDATED"]
            : ["OPEN", "CLOSED", "LIQUIDATED"];
    const takeOf = (value: string | undefined) => {
      const parsed = Number(value ?? 100);
      return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 5000) : 100;
    };
    const tradeTake = takeOf(query.tradeTake);
    const orderTake = takeOf(query.orderTake);
    const tradeWhere = { accountId: { in: accountIds }, status: { in: statuses as never } };

    const [
      openPositions,
      trades,
      tradesTotal,
      orders,
      ordersTotal,
      ledger,
      depositsAgg,
      commissionAgg,
      positionStats,
      wins,
      losses,
      overrides,
    ] = await Promise.all([
      prisma.position.findMany({ where: { accountId: { in: accountIds }, status: "OPEN" }, include: { asset: true }, orderBy: { openedAt: "desc" } }),
      prisma.position.findMany({ where: tradeWhere, include: { asset: true }, orderBy: { openedAt: "desc" }, take: tradeTake }),
      prisma.position.count({ where: tradeWhere }),
      prisma.order.findMany({ where: { accountId: { in: accountIds } }, include: { asset: true }, orderBy: { createdAt: "desc" }, take: orderTake }),
      prisma.order.count({ where: { accountId: { in: accountIds } } }),
      prisma.ledgerEntry.findMany({ where: { accountId: { in: accountIds }, account: { isHouse: false } }, orderBy: { createdAt: "desc" }, take: 25 }),
      prisma.ledgerEntry.aggregate({ where: { accountId: { in: accountIds }, type: "DEPOSIT", direction: "CREDIT" }, _sum: { amount: true } }),
      prisma.ledgerEntry.aggregate({ where: { accountId: { in: accountIds }, type: "COMMISSION", direction: "DEBIT" }, _sum: { amount: true } }),
      prisma.position.groupBy({
        by: ["status"],
        where: { accountId: { in: accountIds } },
        _sum: { realizedPnl: true, unrealizedPnl: true },
        _count: { _all: true },
      }),
      prisma.position.count({ where: { accountId: { in: accountIds }, status: { in: ["CLOSED", "LIQUIDATED"] }, realizedPnl: { gt: 0 } } }),
      prisma.position.count({ where: { accountId: { in: accountIds }, status: { in: ["CLOSED", "LIQUIDATED"] }, realizedPnl: { lt: 0 } } }),
      prisma.userLeverageOverride.findMany({ where: { userId: id, assetId: null, assetClass: null, segment: { not: null } } }),
    ]);

    const originalQty = await filledQtyByPosition(
      trades.filter((p) => p.status !== "OPEN").map((p) => p.id),
    );

    const segments: Record<string, number> = {};
    for (const o of overrides) if (o.segment) segments[o.segment] = o.leverage;

    const open = [];
    for (const p of openPositions) {
      const q = await getQuote(p.asset.symbol);
      open.push({
        id: p.id,
        symbol: p.asset.symbol,
        side: p.side,
        qty: D.num(p.qty),
        entry: D.num(p.avgEntryPrice),
        mark: q?.mid ?? null,
        marginUsed: D.num(p.marginUsed),
        unrealizedPnl: D.num(p.unrealizedPnl),
        liquidationPrice: p.liquidationPrice ? D.num(p.liquidationPrice) : null,
      });
    }
    const marks = new Map(open.map((p) => [p.id, p.mark]));

    const totals = { realized: 0, unrealized: 0, trades: 0, openTrades: 0 };
    for (const row of positionStats) {
      totals.realized += D.num(row._sum.realizedPnl);
      totals.trades += row._count._all;
      if (row.status === "OPEN") {
        totals.unrealized += D.num(row._sum.unrealizedPnl);
        totals.openTrades += row._count._all;
      }
    }
    const commission = D.num(commissionAgg._sum.amount);
    const balance = user.accounts.reduce((a, c) => a + D.num(c.balance), 0);
    const marginUsed = user.accounts.reduce((a, c) => a + D.num(c.marginUsed), 0);

    return {
      user: {
        id: user.id,
        name: user.displayName,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        lastLoginIp: user.lastLoginIp,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      },
      accounts: user.accounts.map((a) => ({ id: a.id, type: a.type, balance: D.num(a.balance), marginUsed: D.num(a.marginUsed), status: a.status })),
      segments,
      stats: {
        balance: D.toMoney(balance),
        marginUsed: D.toMoney(marginUsed),
        deposits: D.num(depositsAgg._sum.amount),
        realizedPnl: D.toMoney(totals.realized),
        unrealizedPnl: D.toMoney(totals.unrealized),
        commission: D.toMoney(commission),
        netPnl: D.toMoney(totals.realized + totals.unrealized - commission),
        trades: totals.trades,
        openTrades: totals.openTrades,
        wins,
        losses,
        winRate: wins + losses > 0 ? wins / (wins + losses) : null,
      },
      openPositions: open,
      tradesTotal,
      trades: trades.map((p) => ({
        id: p.id,
        symbol: p.asset.symbol,
        assetClass: p.asset.assetClass,
        side: p.side,
        qty: p.status === "OPEN" ? D.num(p.qty) : (originalQty.get(p.id) ?? D.num(p.qty)),
        leverage: p.leverage,
        entry: D.num(p.avgEntryPrice),
        exit: p.closedPrice ? D.num(p.closedPrice) : null,
        mark: p.status === "OPEN" ? (marks.get(p.id) ?? null) : null,
        marginUsed: D.num(p.marginUsed),
        commission: D.num(p.commission),
        realizedPnl: D.num(p.realizedPnl),
        unrealizedPnl: D.num(p.unrealizedPnl),
        status: p.status,
        openedAt: p.openedAt.toISOString(),
        closedAt: p.closedAt?.toISOString() ?? null,
      })),
      ordersTotal,
      orders: orders.map((o) => ({
        id: o.id,
        symbol: o.asset.symbol,
        assetClass: o.asset.assetClass,
        side: o.side,
        type: o.type,
        qty: D.num(o.qty),
        price: o.price ? D.num(o.price) : null,
        filledPrice: o.filledPrice ? D.num(o.filledPrice) : null,
        filledQty: D.num(o.filledQty),
        leverage: o.leverage,
        status: o.status,
        positionId: o.positionId,
        createdAt: o.createdAt.toISOString(),
        filledAt: o.filledAt?.toISOString() ?? null,
      })),
      ledger: ledger.map((e) => ({ id: e.id, type: e.type, direction: e.direction, amount: D.num(e.amount), balanceAfter: D.num(e.balanceAfter), memo: e.memo, createdAt: e.createdAt.toISOString() })),
    };
  });

  function csvEscape(v: unknown): string {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function rowsToCsv(headers: string[], rows: unknown[][]): string {
    return [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  }

  app.get("/admin/trades.csv", async (request, reply) => {
    const query = request.query as { tenantId?: string; userId?: string; status?: string };
    const tenantId = tenantScope(request, query.tenantId);
    const statuses =
      query.status === "OPEN"
        ? ["OPEN"]
        : query.status === "LIQUIDATED"
          ? ["LIQUIDATED"]
          : query.status === "ALL"
            ? ["OPEN", "CLOSED", "LIQUIDATED"]
            : ["CLOSED", "LIQUIDATED"];
    const trades = await prisma.position.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(query.userId ? { account: { userId: query.userId } } : {}),
        status: { in: statuses as never },
      },
      include: { asset: true, account: { include: { user: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });
    const originalQty = await filledQtyByPosition(
      trades.filter((p) => p.status !== "OPEN").map((p) => p.id),
    );
    const rows = trades.map((p) => [
      p.account.user.username ?? p.account.user.email, p.account.user.displayName ?? "", p.asset.symbol, p.side,
      p.status === "OPEN" ? D.num(p.qty) : (originalQty.get(p.id) ?? D.num(p.qty)), p.leverage, D.num(p.avgEntryPrice), p.closedPrice ? D.num(p.closedPrice) : "",
      D.num(p.marginUsed), D.num(p.commission), D.num(p.realizedPnl), D.num(p.unrealizedPnl), p.status,
      p.openedAt.toISOString(), p.closedAt?.toISOString() ?? "",
    ]);
    reply.header("content-type", "text/csv").header("content-disposition", 'attachment; filename="realbulls-trades.csv"');
    return rowsToCsv(["user_id", "name", "symbol", "side", "qty", "leverage", "entry", "exit", "margin", "commission", "realized_pnl", "unrealized_pnl", "status", "opened_at", "closed_at"], rows);
  });

  app.get("/admin/ledger.csv", async (request, reply) => {
    const query = request.query as { tenantId?: string; type?: string };
    const tenantId = tenantScope(request, query.tenantId);
    const entries = await prisma.ledgerEntry.findMany({
      where: { ...(tenantId ? { tenantId } : {}), ...(query.type ? { type: query.type as never } : {}), account: { isHouse: false } },
      include: { account: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });
    const rows = entries.map((e) => [
      e.createdAt.toISOString(), e.account.user.username ?? e.account.user.email, e.account.user.displayName ?? "",
      e.type, e.direction, D.num(e.amount), D.num(e.balanceAfter), e.refType ?? "", e.refId ?? "", e.memo ?? "",
    ]);
    reply.header("content-type", "text/csv").header("content-disposition", 'attachment; filename="realbulls-ledger.csv"');
    return rowsToCsv(["time", "user_id", "name", "type", "direction", "amount", "balance_after", "ref_type", "ref_id", "memo"], rows);
  });

  app.get("/admin/tenant-settings", async (request) => {
    const auth = request.auth!;
    const tenant = await prisma.tenant.findUnique({ where: { id: auth.tenantId }, select: { id: true, name: true, allowedSegments: true } });
    return { tenant };
  });

  app.patch("/admin/tenant/segments", async (request) => {
    const auth = request.auth!;
    const body = z.object({ segments: z.array(SEG_ENUM) }).parse(request.body);
    const tenant = await prisma.tenant.update({ where: { id: auth.tenantId }, data: { allowedSegments: body.segments } });
    await prisma.auditLog.create({
      data: { tenantId: auth.tenantId, actorId: auth.sub, action: "TENANT_SEGMENTS", targetType: "Tenant", targetId: auth.tenantId, after: body.segments, ip: request.ip },
    });
    return { allowedSegments: tenant.allowedSegments };
  });

  app.get("/admin/summary", async (request) => {
    const query = request.query as { tenantId?: string };
    const tenantId = tenantScope(request, query.tenantId);
    const scope = tenantId ? { tenantId } : {};

    const [users, admins, accounts, openPositions, closedAgg, commissionAgg, depositAgg, balanceAgg] = await Promise.all([
      prisma.user.count({ where: { ...scope, email: { not: { endsWith: ".internal" } } } }),
      prisma.user.count({ where: { ...scope, role: { in: ["SUPER_ADMIN", "TENANT_ADMIN"] } } }),
      prisma.account.count({ where: { ...scope, isHouse: false } }),
      prisma.position.count({ where: { ...scope, status: "OPEN" } }),
      prisma.position.aggregate({ where: { ...scope, status: { in: ["CLOSED", "LIQUIDATED"] } }, _sum: { realizedPnl: true } }),
      prisma.ledgerEntry.aggregate({ where: { ...scope, type: "COMMISSION", direction: "DEBIT" }, _sum: { amount: true } }),
      prisma.ledgerEntry.aggregate({ where: { ...scope, type: "DEPOSIT", direction: "CREDIT" }, _sum: { amount: true } }),
      prisma.account.aggregate({ where: { ...scope, isHouse: false }, _sum: { marginUsed: true, balance: true } }),
    ]);

    return {
      users,
      admins,
      accounts,
      openPositions,
      totalRealizedPnl: D.num(closedAgg._sum.realizedPnl),
      totalCommission: D.num(commissionAgg._sum.amount),
      totalDeposits: D.num(depositAgg._sum.amount),
      openMargin: D.num(balanceAgg._sum.marginUsed),
      totalBalance: D.num(balanceAgg._sum.balance),
    };
  });

  app.get("/admin/positions", async (request) => {
    const query = request.query as { tenantId?: string };
    const tenantId = tenantScope(request, query.tenantId);
    const positions = await prisma.position.findMany({
      where: { status: "OPEN", ...(tenantId ? { tenantId } : {}) },
      include: { account: { include: { user: true } }, asset: true },
      orderBy: { openedAt: "desc" },
      take: 300,
    });
    const out = [];
    for (const p of positions) {
      const q = await getQuote(p.asset.symbol);
      out.push({
        id: p.id,
        userId: p.account.userId,
        email: p.account.user.email,
        ip: p.account.user.lastLoginIp,
        symbol: p.asset.symbol,
        side: p.side,
        qty: D.num(p.qty),
        leverage: p.leverage,
        entry: D.num(p.avgEntryPrice),
        mark: q?.mid ?? null,
        marginUsed: D.num(p.marginUsed),
        unrealizedPnl: D.num(p.unrealizedPnl),
        liquidationPrice: p.liquidationPrice ? D.num(p.liquidationPrice) : null,
      });
    }
    return { positions: out };
  });

  app.post("/admin/positions/:id/force-close", async (request) => {
    const { id } = request.params as { id: string };
    const pos = await prisma.position.findUnique({ where: { id } });
    if (!pos) throw notFound("Position not found");
    tenantScope(request, pos.tenantId);
    const result = await closePosition({ positionId: id, accountId: pos.accountId, reason: "ADMIN_FORCE_CLOSE", createdBy: request.auth!.sub });
    await prisma.auditLog.create({ data: { tenantId: pos.tenantId, actorId: request.auth!.sub, action: "FORCE_CLOSE", targetType: "Position", targetId: id, ip: request.ip } });
    return result;
  });

  const accountStatusSchema = z.object({ status: z.enum(["ACTIVE", "MARGIN_CALL", "LIQUIDATED", "CLOSED"]) });
  app.patch("/admin/accounts/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = accountStatusSchema.parse(request.body);
    const acct = await prisma.account.findUnique({ where: { id } });
    if (!acct || acct.isHouse) throw notFound("Account not found");
    tenantScope(request, acct.tenantId);
    await prisma.account.update({ where: { id }, data: { status: body.status } });
    await prisma.auditLog.create({ data: { tenantId: acct.tenantId, actorId: request.auth!.sub, action: "ACCOUNT_STATUS", targetType: "Account", targetId: id, after: body, ip: request.ip } });
    return { ok: true };
  });

  app.post("/admin/ledger/adjust", async (request) => {
    const auth = request.auth!;
    const body = adminAdjustSchema.parse(request.body);
    const account = await prisma.account.findUnique({ where: { id: body.accountId } });
    if (!account || account.isHouse) throw notFound("Account not found");
    tenantScope(request, account.tenantId);

    const delta =
      body.type === "DEPOSIT" ? Math.abs(body.amount) : body.type === "WITHDRAWAL" ? -Math.abs(body.amount) : body.amount;
    if (delta === 0) throw badRequest("Amount must be non-zero");

    const result = await postLedgerChanges(account.id, [{ type: body.type, delta, memo: body.memo ?? `Admin ${body.type.toLowerCase()}` }], { createdBy: auth.sub });
    await prisma.auditLog.create({
      data: { tenantId: account.tenantId, actorId: auth.sub, action: "LEDGER_ADJUST", targetType: "Account", targetId: account.id, after: { type: body.type, amount: body.amount }, ip: request.ip },
    });
    return result;
  });

  app.get("/admin/leverage", async (request) => {
    const query = request.query as { tenantId?: string };
    const tenantId = tenantScope(request, query.tenantId);
    const rules = await prisma.leverageRule.findMany({
      where: tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {},
      orderBy: { createdAt: "desc" },
    });
    return {
      rules: rules.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        scope: r.scope,
        assetClass: r.assetClass,
        assetId: r.assetId,
        maxLeverage: r.maxLeverage,
        marginCallPct: D.num(r.marginCallPct),
        stopOutPct: D.num(r.stopOutPct),
        enabled: r.enabled,
      })),
    };
  });

  app.put("/admin/leverage", async (request, reply) => {
    const body = leverageUpdateSchema.parse(request.body);
    const tenantId = tenantScope(request, body.tenantId ?? null);
    const rule = await prisma.leverageRule.create({
      data: {
        tenantId,
        scope: body.scope,
        assetClass: body.assetClass ?? null,
        assetId: body.assetId ?? null,
        maxLeverage: body.maxLeverage,
        marginCallPct: body.marginCallPct ?? 100,
        stopOutPct: body.stopOutPct ?? 5,
      },
    });
    reply.code(201);
    return { id: rule.id };
  });

  app.put("/admin/users/:id/leverage", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = userLeverageSchema.parse({ ...(request.body as object), userId: id });
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound("User not found");
    tenantScope(request, target.tenantId);

    await prisma.userLeverageOverride.deleteMany({
      where: { userId: id, assetId: body.assetId ?? null, assetClass: body.assetClass ?? null },
    });
    const created = await prisma.userLeverageOverride.create({
      data: { userId: id, assetId: body.assetId ?? null, assetClass: body.assetClass ?? null, leverage: body.leverage },
    });
    reply.code(201);
    return { id: created.id };
  });

  app.put("/admin/users/:id/leverage/segments", async (request, reply) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };
    const body = leverageSegmentsSchema.parse(request.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound("User not found");
    if (target.displayName === "HOUSE") throw forbidden("System account is not editable");
    tenantScope(request, target.tenantId);

    if ((target.role === "SUPER_ADMIN" || target.role === "TENANT_ADMIN") && auth.role !== "SUPER_ADMIN") {
      throw forbidden("Only a super admin can set leverage for admins");
    }

    await prisma.userLeverageOverride.deleteMany({
      where: { userId: id, segment: { not: null }, assetId: null, assetClass: null },
    });
    for (const [segment, value] of Object.entries(body.segments)) {
      if (value === undefined) continue;
      await prisma.userLeverageOverride.create({
        data: { userId: id, segment: segment as never, leverage: value },
      });
    }

    await prisma.auditLog.create({
      data: { tenantId: target.tenantId, actorId: auth.sub, action: "LEVERAGE_SEGMENTS", targetType: "User", targetId: id, after: body.segments, ip: request.ip },
    });

    const segMap = await segmentMapFor([id]);
    reply.code(201);
    return { segments: segMap.get(id) ?? {} };
  });

  app.put("/admin/assets/config", async (request, reply) => {
    const body = assetConfigSchema.parse(request.body);
    const tenantId = tenantScope(request, body.tenantId)!;
    const asset = await prisma.asset.findUnique({ where: { id: body.assetId } });
    if (!asset) throw notFound("Asset not found");
    const config = await prisma.assetConfig.upsert({
      where: { tenantId_assetId: { tenantId, assetId: body.assetId } },
      update: {
        enabled: body.enabled,
        spreadMarkupBps: body.spreadMarkupBps,
        spreadMarkdownBps: body.spreadMarkdownBps,
        commissionPerLot: body.commissionPerLot,
        minLeverage: body.minLeverage,
        maxLeverage: body.maxLeverage,
      },
      create: {
        tenantId,
        assetId: body.assetId,
        enabled: body.enabled ?? true,
        spreadMarkupBps: body.spreadMarkupBps ?? 0,
        spreadMarkdownBps: body.spreadMarkdownBps ?? 0,
        commissionPerLot: body.commissionPerLot ?? 0,
        minLeverage: body.minLeverage ?? 1,
        maxLeverage: body.maxLeverage ?? null,
      },
    });
    reply.code(201);
    return { id: config.id };
  });

  app.get("/admin/audit", async (request) => {
    const query = request.query as { tenantId?: string };
    const tenantId = tenantScope(request, query.tenantId);
    const logs = await prisma.auditLog.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { logs };
  });
}
