// Fresh-slate wipe: trading-domain rows gone, keeper balances zeroed.
// KEEPS: users, accounts, instruments, assets, rules, tenants, watchlists,
// audit. RUN ONLY WITH THE API STOPPED. Fully backed up pre-wipe.
import { prisma } from "../src/lib/prisma.js";

await prisma.$transaction(
  async (tx) => {
    await tx.$executeRawUnsafe(
      `TRUNCATE "LedgerEntry", "Position", "Order", "Notification", "PriceAlert", "Session" RESTART IDENTITY CASCADE`,
    );
    await tx.$executeRaw`UPDATE "Account" SET balance = 0, "marginUsed" = 0, status = 'ACTIVE' WHERE "isHouse" = false`;
  },
  { timeout: 180000 },
);

const left = await prisma.$queryRaw<Array<{ ledger: bigint; pos: bigint; ord: bigint }>>`
  SELECT (SELECT COUNT(*) FROM "LedgerEntry") AS ledger,
         (SELECT COUNT(*) FROM "Position") AS pos,
         (SELECT COUNT(*) FROM "Order") AS ord`;
console.log(`left: ledger=${String(left[0].ledger)} pos=${String(left[0].pos)} ord=${String(left[0].ord)}`);
const bals = await prisma.$queryRaw<Array<{ n: bigint; s: number }>>`
  SELECT COUNT(*) AS n, SUM(balance)::float8 AS s FROM "Account" WHERE "isHouse" = false`;
console.log(`non-house accounts=${String(bals[0].n)} sum=${bals[0].s}`);
await prisma.$disconnect();
process.exit(0);
