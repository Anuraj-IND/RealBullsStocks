import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../plugins/auth.js";

export default async function notificationRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/notifications", async (request) => {
    const auth = request.auth!;
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId: auth.sub }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.notification.count({ where: { userId: auth.sub, read: false } }),
    ]);
    return {
      unread,
      notifications: items.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        data: ((n as unknown as { data?: unknown }).data ?? null) as {
          amountInr?: number;
          price?: number;
          quoteCurrency?: string;
        } | null,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  });

  app.post("/notifications/read", async (request) => {
    const auth = request.auth!;
    const body = request.body as { ids?: string[] } | undefined;
    if (body?.ids && body.ids.length > 0) {
      await prisma.notification.updateMany({ where: { userId: auth.sub, id: { in: body.ids } }, data: { read: true } });
    } else {
      await prisma.notification.updateMany({ where: { userId: auth.sub, read: false }, data: { read: true } });
    }
    return { ok: true };
  });

  app.delete("/notifications/:id", async (request) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };
    await prisma.notification.deleteMany({ where: { id, userId: auth.sub } });
    return { ok: true };
  });

  app.delete("/notifications", async (request) => {
    const auth = request.auth!;
    await prisma.notification.deleteMany({ where: { userId: auth.sub } });
    return { ok: true };
  });
}
