// One-shot USD→₹ ledger migration. RUN ONLY WITH THE API STOPPED.
// Multiplies every ledger-denominated stored value by 83.5; market-terms
// prices (entry/exit/fills/quotes), quantities, percents, leverage and all
// ₹-native fee configs are untouched. Refuses to run twice.
import { prisma } from "../src/lib/prisma.js";

const RATE = 83.5;

const inrAccounts = await prisma.account.count({ where: { baseCurrency: "INR" } });
if (inrAccounts > 0) throw new Error(`already migrated (${inrAccounts} INR accounts) — aborting`);

const pre = await prisma.$queryRaw<Array<{ ledger: bigint; positions: bigint; users: bigint }>>`
  SELECT (SELECT COUNT(*) FROM "LedgerEntry") AS ledger,
         (SELECT COUNT(*) FROM "Position") AS positions,
         (SELECT COUNT(*) FROM "User") AS users`;
console.log(`pre-counts: ledger=${String(pre[0].ledger)} positions=${String(pre[0].positions)} users=${String(pre[0].users)}`);

await prisma.$transaction(
  async (tx) => {
    // Lift the append-only guard for this migration only — re-created below
    // before commit, so any rollback restores it too (DDL is transactional).
    await tx.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ledger_no_update ON "LedgerEntry"`);
    const acc = await tx.$executeRaw`UPDATE "Account" SET balance = balance * ${RATE}, "marginUsed" = "marginUsed" * ${RATE}, "baseCurrency" = 'INR'`;
    const pos = await tx.$executeRaw`UPDATE "Position" SET "marginUsed" = "marginUsed" * ${RATE}, "unrealizedPnl" = "unrealizedPnl" * ${RATE}, "realizedPnl" = "realizedPnl" * ${RATE}, commission = commission * ${RATE}`;
    const led = await tx.$executeRaw`UPDATE "LedgerEntry" SET amount = amount * ${RATE}, "balanceAfter" = "balanceAfter" * ${RATE}`;
    const not = await tx.$executeRaw`UPDATE "Notification" SET data = jsonb_set(data - 'amountUsd', '{amountInr}', to_jsonb(((data->>'amountUsd')::numeric * ${RATE}))) WHERE data ? 'amountUsd'`;
    await tx.$executeRawUnsafe(`CREATE TRIGGER ledger_no_update BEFORE UPDATE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION realbulls_ledger_immutable()`);
    console.log(`updated: accounts=${acc} positions=${pos} ledger=${led} notifications=${not}`);
  },
  { timeout: 180000 },
);

// Post-verify: trader4510 balance ≈ 316.32 × 83.5 = 26412.6.
const t = await prisma.user.findFirst({ where: { email: "trader4510@realbulls.local" } });
const ta = await prisma.account.findFirst({ where: { userId: t!.id } });
console.log(`trader4510 balance=${ta!.balance} (expect ~26412.6), base=${ta!.baseCurrency}`);
await prisma.$disconnect();
process.exit(0);
