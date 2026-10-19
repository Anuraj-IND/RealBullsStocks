-- Enforce append-only ledger semantics at the database level.
-- Ledger rows may never be updated or deleted; corrections must be posted
-- as compensating entries. Applied by packages/db/src/applySql.ts.

CREATE OR REPLACE FUNCTION realbulls_ledger_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'LedgerEntry is append-only (attempted %) on id=%', TG_OP, COALESCE(NEW.id, OLD.id);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_update ON "LedgerEntry";
CREATE TRIGGER ledger_no_update
  BEFORE UPDATE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION realbulls_ledger_immutable();

DROP TRIGGER IF EXISTS ledger_no_delete ON "LedgerEntry";
CREATE TRIGGER ledger_no_delete
  BEFORE DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION realbulls_ledger_immutable();
