import { prisma } from "./prisma.js";
import { D } from "./money.js";

export async function filledQtyByPosition(positionIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(positionIds)].filter(Boolean);
  if (ids.length === 0) return new Map();

  const rows = await prisma.order.groupBy({
    by: ["positionId"],
    where: { positionId: { in: ids }, status: "FILLED" },
    _sum: { filledQty: true },
  });

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.positionId) map.set(row.positionId, D.num(row._sum.filledQty));
  }
  return map;
}
