import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { watchlistAddSchema } from "@realbulls/shared";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../plugins/auth.js";
import { notFound, badRequest, forbidden } from "../lib/errors.js";
import { toAssetDTO } from "../lib/serialize.js";
import { requireTenant } from "../lib/tenant.js";
import { D } from "../lib/money.js";
import { getEffectiveConfig, getQuoteForAsset, resolveRisk, resolveAssetSegment } from "../services/market.service.js";
import { ensureAssetForInstrument } from "../services/instrument.service.js";
import { getNseMarketStatus, marketStatusForAsset } from "../services/market-status.service.js";

export default async function marketRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/market/status", async () => {
    return { nse: await getNseMarketStatus() };
  });

  app.get("/assets", async (request) => {
    const tenant = await requireTenant(request);
    const user = await prisma.user.findUnique({
      where: { id: request.auth!.sub },
      select: { commissionPerLotOverride: true, commissionPerOrderOverride: true, allowedSegments: true },
    });
    const override = user?.commissionPerLotOverride != null ? D.num(user.commissionPerLotOverride) : null;
    const overrideOrder = user?.commissionPerOrderOverride != null ? D.num(user.commissionPerOrderOverride) : null;
    const allowed = user?.allowedSegments?.length ? user.allowedSegments : tenant.allowedSegments?.length ? tenant.allowedSegments : [];
    const assets = await prisma.asset.findMany({ where: { enabled: true }, orderBy: { symbol: "asc" } });
    const result = [];
    for (const a of assets) {
      const assetSegment = resolveAssetSegment(a);
      if (allowed.length > 0 && !allowed.includes(assetSegment)) continue;
      const config = await getEffectiveConfig(tenant.id, a);
      const risk = await resolveRisk(request.auth!.sub, tenant.id, a, config);
      const [quote, status] = await Promise.all([getQuoteForAsset(a), marketStatusForAsset(a)]);
      result.push({
        ...toAssetDTO(a, {
          spreadMarkupBps: config.spreadMarkupBps,
          commissionPerLot: override ?? config.commissionPerLot,
          commissionPerOrder: overrideOrder ?? config.commissionPerOrder,
        }),
        enabled: config.enabled,
        segment: assetSegment,
        marketOpen: status.open,
        marketStatusReason: status.reason,
        marketStatusSource: status.source,
        leverage: risk.leverage,
        marginCallPct: risk.marginCallPct,
        stopOutPct: risk.stopOutPct,
        ...(quote
          ? {
              bid: quote.bid,
              ask: quote.ask,
              mid: quote.mid,
              ts: quote.ts,
              quoteSource: quote.source,
              quoteKind: quote.kind,
              quoteAsOf: quote.asOf,
            }
          : {}),
      });
    }
    return { assets: result };
  });

  app.get("/assets/:id/quote", async (request) => {
    const { id } = request.params as { id: string };
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) throw notFound("Asset not found");
    const [quote, status] = await Promise.all([getQuoteForAsset(asset), marketStatusForAsset(asset)]);
    if (!quote) throw notFound("No quote available for symbol");
    return {
      symbol: asset.symbol,
      marketOpen: status.open,
      marketStatusReason: status.reason,
      marketStatusSource: status.source,
      feedSource: asset.feedSource,
      ...quote,
    };
  });

  app.get("/assets/:id/candles", async (request) => {
    const { id } = request.params as { id: string };
    const query = request.query as { timeframe?: string; limit?: string };
    const timeframe = (query.timeframe ?? "M1") as "M1" | "M5" | "M15" | "H1" | "H4" | "D1";
    const limit = Math.min(Number(query.limit ?? 500), 2000);
    const candles = await prisma.candle.findMany({
      where: { assetId: id, timeframe },
      orderBy: { bucket: "desc" },
      take: limit,
    });
    return {
      candles: candles
        .map((c) => ({ time: Math.floor(c.bucket.getTime() / 1000), open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: Number(c.volume) }))
        .reverse(),
    };
  });

  app.get("/watchlists", async (request) => {
    const userId = request.auth!.sub;
    const watchlists = await prisma.watchlist.findMany({
      where: { userId },
      include: { items: { include: { asset: true }, orderBy: { sortOrder: "asc" } } },
    });
    const out = [];
    for (const wl of watchlists) {
      const items = [];
      for (const item of wl.items) {
        const [quote, status] = await Promise.all([getQuoteForAsset(item.asset), marketStatusForAsset(item.asset)]);
        items.push({
          assetId: item.assetId,
          symbol: item.asset.symbol,
          name: item.asset.name,
          assetClass: item.asset.assetClass,
          segment: item.asset.segment,
          feedSource: item.asset.feedSource,
          marketOpen: status.open,
          marketStatusReason: status.reason,
          marketStatusSource: status.source,
          ...(quote
            ? {
                bid: quote.bid,
                ask: quote.ask,
                mid: quote.mid,
                ts: quote.ts,
                quoteSource: quote.source,
                quoteKind: quote.kind,
                quoteAsOf: quote.asOf,
              }
            : {}),
        });
      }
      out.push({ id: wl.id, name: wl.name, items });
    }
    return { watchlists: out };
  });

  app.post("/watchlists/items", async (request) => {
    const userId = request.auth!.sub;
    const body = watchlistAddSchema.parse(request.body);
    const assetId = body.assetId ?? (body.instrumentToken ? (await ensureAssetForInstrument(body.instrumentToken)).id : null);
    if (!assetId) throw badRequest("assetId or instrumentToken is required");
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw notFound("Asset not found");

    let watchlistId = body.watchlistId;
    if (!watchlistId) {
      const existing = await prisma.watchlist.findFirst({ where: { userId } });
      watchlistId = existing?.id ?? (await prisma.watchlist.create({ data: { userId } })).id;
    } else {
      const wl = await prisma.watchlist.findUnique({ where: { id: watchlistId } });
      if (!wl || wl.userId !== userId) throw forbidden("Not your watchlist");
    }
    const count = await prisma.watchlistItem.count({ where: { watchlistId } });
    await prisma.watchlistItem.upsert({
      where: { watchlistId_assetId: { watchlistId, assetId } },
      update: {},
      create: { watchlistId, assetId, sortOrder: count },
    });
    return { ok: true, watchlistId, assetId };
  });

  app.delete("/watchlists/items/:assetId", async (request) => {
    const userId = request.auth!.sub;
    const { assetId } = request.params as { assetId: string };
    const q = request.query as { watchlistId?: string };
    const wl = q.watchlistId
      ? await prisma.watchlist.findUnique({ where: { id: q.watchlistId } })
      : await prisma.watchlist.findFirst({ where: { userId } });
    if (!wl || wl.userId !== userId) throw notFound("Watchlist not found");
    await prisma.watchlistItem.deleteMany({ where: { watchlistId: wl.id, assetId } });
    return { ok: true };
  });

  const watchlistNameSchema = z.object({ name: z.string().min(1).max(40) });

  app.post("/watchlists", async (request, reply) => {
    const userId = request.auth!.sub;
    const body = watchlistNameSchema.parse(request.body);
    const count = await prisma.watchlist.count({ where: { userId } });
    if (count >= 20) throw badRequest("Watchlist limit reached (20)");
    const wl = await prisma.watchlist.create({ data: { userId, name: body.name.trim() } });
    reply.code(201);
    return { id: wl.id, name: wl.name };
  });

  app.patch("/watchlists/:id", async (request) => {
    const userId = request.auth!.sub;
    const { id } = request.params as { id: string };
    const body = watchlistNameSchema.parse(request.body);
    const wl = await prisma.watchlist.findUnique({ where: { id } });
    if (!wl || wl.userId !== userId) throw notFound("Watchlist not found");
    await prisma.watchlist.update({ where: { id }, data: { name: body.name.trim() } });
    return { ok: true };
  });

  app.delete("/watchlists/:id", async (request) => {
    const userId = request.auth!.sub;
    const { id } = request.params as { id: string };
    const wl = await prisma.watchlist.findUnique({ where: { id } });
    if (!wl || wl.userId !== userId) throw notFound("Watchlist not found");
    const count = await prisma.watchlist.count({ where: { userId } });
    if (count <= 1) throw badRequest("You must keep at least one watchlist");
    await prisma.watchlist.delete({ where: { id } });
    return { ok: true };
  });
}
