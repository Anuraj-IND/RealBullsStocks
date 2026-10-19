import type { FastifyInstance } from "fastify";
import { authenticate, requireRole } from "../plugins/auth.js";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import {
  ensureAssetForInstrument,
  searchInstruments,
  syncInstruments,
} from "../services/instrument.service.js";

export default async function instrumentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/instruments/search", async (request) => {
    const q = request.query as { q?: string; exchange?: string; type?: string; limit?: string };
    const results = await searchInstruments({
      q: q.q,
      exchange: q.exchange
        ? q.exchange
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        : undefined,
      type: q.type,
      limit: q.limit ? Number(q.limit) : undefined,
    });
    return { instruments: results };
  });

  app.get("/instruments/status", async () => {
    const [count, lastSync] = await Promise.all([
      prisma.instrument.count(),
      redis.get("instruments:lastSync"),
    ]);
    return { count, lastSync: lastSync ? Number(lastSync) : null };
  });

  app.post("/instruments/:token/asset", async (request) => {
    const { token } = request.params as { token: string };
    const asset = await ensureAssetForInstrument(token);
    return {
      asset: {
        id: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        assetClass: asset.assetClass,
        segment: asset.segment,
        instrumentToken: asset.instrumentToken,
        expiry: asset.expiry,
        strike: asset.strike ? Number(asset.strike) : null,
        optionType: asset.optionType,
      },
    };
  });

  app.post("/instruments/sync", { preHandler: requireRole("SUPER_ADMIN") }, async () => {
    const synced = await syncInstruments();
    return { ok: true, synced };
  });
}
