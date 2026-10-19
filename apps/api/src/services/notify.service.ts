import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";


export async function notify(userId: string, tenantId: string, kind: string, title: string, body?: string) {
  const n = await prisma.notification.create({ data: { userId, tenantId, kind, title, body } });
  await redis.publish(
    `notify:${userId}`,
    JSON.stringify({ id: n.id, kind, title, body: body ?? null, createdAt: n.createdAt.toISOString() }),
  );
  return n;
}


export async function notifyAccountOwner(accountId: string, kind: string, title: string, body?: string) {
  const acct = await prisma.account.findUnique({ where: { id: accountId }, select: { userId: true, tenantId: true, isHouse: true } });
  if (!acct || acct.isHouse) return null;
  return notify(acct.userId, acct.tenantId, kind, title, body);
}
