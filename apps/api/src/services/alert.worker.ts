import { prisma } from "../lib/prisma.js";
import { getQuote } from "./market.service.js";
import { notify } from "./notify.service.js";

let timer: NodeJS.Timeout | null = null;

async function tick(): Promise<void> {
  const alerts = await prisma.priceAlert.findMany({ where: { status: "ACTIVE" }, include: { asset: true }, take: 500 });
  for (const alert of alerts) {
    const q = await getQuote(alert.asset.symbol);
    if (!q) continue;
    const price = Number(alert.price);
    const hit = alert.direction === "ABOVE" ? q.mid >= price : q.mid <= price;
    if (!hit) continue;

    await prisma.priceAlert.update({ where: { id: alert.id }, data: { status: "TRIGGERED", triggeredAt: new Date() } });
    await notify(
      alert.userId,
      alert.tenantId,
      "ALERT",
      `${alert.asset.symbol} ${alert.direction === "ABOVE" ? "≥" : "≤"} ${price}`,
      `Price is now ${q.mid}`,
    );
  }
}

export function startAlertWorker(): void {
  if (timer) return;
  console.log("[alert.worker] started (3s)");
  timer = setInterval(() => void tick().catch(() => undefined), 3000);
}

export function stopAlertWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
