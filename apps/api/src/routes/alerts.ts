import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../plugins/auth.js";
import { getQuote } from "../services/market.service.js";
import { notFound } from "../lib/errors.js";
import { D } from "../lib/money.js";

const createAlertSchema = z.object({
  assetId: z.string().min(1),
  direction: z.enum(["ABOVE", "BELOW"]),
  price: z.coerce.number().positive(),
  note: z.string().max(140).optional(),
});

export default async function alertRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/alerts", async (request) => {
    const auth = request.auth!;
    const alerts = await prisma.priceAlert.findMany({
      where: { userId: auth.sub },
      include: { asset: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const out = [];
    for (const a of alerts) {
      const q = await getQuote(a.asset.symbol);
      out.push({
        id: a.id,
        assetId: a.assetId,
        symbol: a.asset.symbol,
        direction: a.direction,
        price: D.num(a.price),
        status: a.status,
        note: a.note,
        mark: q?.mid ?? null,
        createdAt: a.createdAt.toISOString(),
        triggeredAt: a.triggeredAt?.toISOString() ?? null,
      });
    }
    return { alerts: out };
  });

  app.post("/alerts", async (request, reply) => {
    const auth = request.auth!;
    const body = createAlertSchema.parse(request.body);
    const asset = await prisma.asset.findUnique({ where: { id: body.assetId } });
    if (!asset) throw notFound("Asset not found");
    const alert = await prisma.priceAlert.create({
      data: { userId: auth.sub, tenantId: auth.tenantId, assetId: body.assetId, direction: body.direction, price: D.dec(body.price), note: body.note },
    });
    reply.code(201);
    return { id: alert.id };
  });

  app.delete("/alerts/:id", async (request) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };
    const alert = await prisma.priceAlert.findUnique({ where: { id } });
    if (!alert || alert.userId !== auth.sub) throw notFound("Alert not found");
    await prisma.priceAlert.delete({ where: { id } });
    return { ok: true };
  });
}
