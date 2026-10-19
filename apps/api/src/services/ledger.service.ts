import { randomUUID } from "node:crypto";
import { Prisma } from "@realbulls/db";
import type { LedgerType } from "@realbulls/shared";
import { prisma } from "../lib/prisma.js";
import { badRequest, notFound } from "../lib/errors.js";
import { D } from "../lib/money.js";

export interface LedgerChange {
  type: LedgerType;
  
  delta: number;
  refType?: string;
  refId?: string;
  memo?: string;
  
  auditOnly?: boolean;
}

export interface PostResult {
  accountId: string;
  entryGroupId: string;
  balanceBefore: number;
  balanceAfter: number;
}

async function houseAccountId(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
  const house = await tx.account.findFirst({
    where: { tenantId, isHouse: true },
    select: { id: true },
  });
  if (!house) throw notFound(`No house account for tenant ${tenantId}`);
  return house.id;
}


export async function postLedgerChanges(
  accountId: string,
  changes: LedgerChange[],
  opts: { createdBy?: string; entryGroupId?: string } = {},
): Promise<PostResult> {
  return prisma.$transaction(
    (tx) => postLedgerChangesWithin(tx, accountId, changes, opts),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}


export async function postLedgerChangesWithin(
  tx: Prisma.TransactionClient,
  accountId: string,
  changes: LedgerChange[],
  opts: { createdBy?: string; entryGroupId?: string } = {},
): Promise<PostResult> {
  if (changes.length === 0) throw badRequest("No ledger changes supplied");
  const entryGroupId = opts.entryGroupId ?? randomUUID();

  {
      const rows = await tx.$queryRaw<
        Array<{ id: string; tenantId: string; balance: Prisma.Decimal }>
      >`SELECT id, "tenantId", balance FROM "Account" WHERE id = ${accountId} FOR UPDATE`;
      const account = rows[0];
      if (!account) throw notFound("Account not found");

      const houseId = await houseAccountId(tx, account.tenantId);
      let balance = D.num(account.balance);
      const balanceBefore = balance;

      for (const change of changes) {
        const amount = Math.abs(change.delta);
        if (amount === 0) continue;

        if (change.auditOnly) {
          await tx.ledgerEntry.create({
            data: {
              tenantId: account.tenantId,
              accountId,
              entryGroupId,
              direction: change.delta >= 0 ? "CREDIT" : "DEBIT",
              type: change.type,
              amount: D.dec(amount),
              balanceAfter: D.dec(balance),
              refType: change.refType,
              refId: change.refId,
              memo: change.memo,
              createdBy: opts.createdBy,
            },
          });
          await tx.ledgerEntry.create({
            data: {
              tenantId: account.tenantId,
              accountId: houseId,
              entryGroupId,
              direction: change.delta >= 0 ? "DEBIT" : "CREDIT",
              type: change.type,
              amount: D.dec(amount),
              balanceAfter: D.dec(0),
              refType: change.refType,
              refId: change.refId,
              memo: `house:${change.memo ?? change.type}`,
              createdBy: opts.createdBy,
            },
          });
          continue;
        }

        balance = D.toMoney(balance + change.delta);
        const credit = change.delta >= 0;

        await tx.ledgerEntry.create({
          data: {
            tenantId: account.tenantId,
            accountId,
            entryGroupId,
            direction: credit ? "CREDIT" : "DEBIT",
            type: change.type,
            amount: D.dec(amount),
            balanceAfter: D.dec(balance),
            refType: change.refType,
            refId: change.refId,
            memo: change.memo,
            createdBy: opts.createdBy,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            tenantId: account.tenantId,
            accountId: houseId,
            entryGroupId,
            direction: credit ? "DEBIT" : "CREDIT",
            type: change.type,
            amount: D.dec(amount),
            balanceAfter: D.dec(0),
            refType: change.refType,
            refId: change.refId,
            memo: `house:${change.memo ?? change.type}`,
            createdBy: opts.createdBy,
          },
        });
      }

      if (balance !== balanceBefore) {
        await tx.account.update({ where: { id: accountId }, data: { balance: D.dec(balance) } });
      }

      return { accountId, entryGroupId, balanceBefore, balanceAfter: balance };
  }
}


export function credit(accountId: string, type: LedgerType, amount: number, memo?: string, createdBy?: string) {
  return postLedgerChanges(accountId, [{ type, delta: amount, memo }], { createdBy });
}

export function debit(accountId: string, type: LedgerType, amount: number, memo?: string, createdBy?: string) {
  return postLedgerChanges(accountId, [{ type, delta: -amount, memo }], { createdBy });
}

export async function getStatement(accountId: string, take = 100) {
  return prisma.ledgerEntry.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
