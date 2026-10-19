import { prisma } from "./client.js";


const STATEMENTS = [
  `CREATE OR REPLACE FUNCTION realbulls_ledger_immutable()
   RETURNS TRIGGER AS $$
   BEGIN
     RAISE EXCEPTION 'LedgerEntry is append-only (attempted %) on id=%', TG_OP, COALESCE(NEW.id, OLD.id);
   END;
   $$ LANGUAGE plpgsql;`,
  `DROP TRIGGER IF EXISTS ledger_no_update ON "LedgerEntry";`,
  `CREATE TRIGGER ledger_no_update
     BEFORE UPDATE ON "LedgerEntry"
     FOR EACH ROW EXECUTE FUNCTION realbulls_ledger_immutable();`,
  `DROP TRIGGER IF EXISTS ledger_no_delete ON "LedgerEntry";`,
  `CREATE TRIGGER ledger_no_delete
     BEFORE DELETE ON "LedgerEntry"
     FOR EACH ROW EXECUTE FUNCTION realbulls_ledger_immutable();`,
];

export async function applySql(): Promise<void> {
  for (const statement of STATEMENTS) {
    await prisma.$executeRawUnsafe(statement);
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("applySql.ts")) {
  applySql()
    .then(() => console.log("[db] ledger immutability triggers applied"))
    .catch((err) => {
      console.error("[db] failed to apply SQL", err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
