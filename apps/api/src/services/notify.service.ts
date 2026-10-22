import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";


export async function notify(
  userId: string,
  tenantId: string,
  kind: string,
  title: string,
  body?: string,
  data?: { amountInr?: number; price?: number; quoteCurrency?: string },
) {
  const payload: Record<string, number | string> = {};
  if (data?.amountInr !== undefined) payload.amountInr = data.amountInr;
  if (data?.price !== undefined) payload.price = data.price;
  if (data?.quoteCurrency) payload.quoteCurrency = data.quoteCurrency;
  // The `data` column exists in the DB; the generated client picks it up
  // after the next `prisma generate` (needs the API stopped on Windows —
  // the running process locks the engine DLL). Until then this write and
  // the read in routes/notifications.ts degrade to the legacy text fallback.
  const createArg = { userId, tenantId, kind, title, body } as unknown as Record<string, unknown>;
  if (Object.keys(payload).length) createArg.data = payload;
  // Loosely typed on purpose (see comment above).
  const create = prisma.notification.create as unknown as (args: {
    data: Record<string, unknown>;
  }) => Promise<{ id: string; createdAt: Date }>;
  let n;
  try {
    n = await create({ data: createArg });
  } catch {
    // Pre-regenerate client rejects the unknown `data` arg — persist bare.
    n = await create({ data: { userId, tenantId, kind, title, body } });
  }
  await redis.publish(
    `notify:${userId}`,
    JSON.stringify({
      id: n.id,
      kind,
      title,
      body: body ?? null,
      data: Object.keys(payload).length ? payload : null,
      createdAt: n.createdAt.toISOString(),
    }),
  );
  return n;
}


export async function notifyAccountOwner(
  accountId: string,
  kind: string,
  title: string,
  body?: string,
  data?: { amountInr?: number; price?: number; quoteCurrency?: string },
) {
  const acct = await prisma.account.findUnique({ where: { id: accountId }, select: { userId: true, tenantId: true, isHouse: true } });
  if (!acct || acct.isHouse) return null;
  return notify(acct.userId, acct.tenantId, kind, title, body, data);
}
