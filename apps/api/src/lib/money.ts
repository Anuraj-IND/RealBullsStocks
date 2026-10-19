import { Prisma } from "@realbulls/db";


export function num(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(value.toString());
}


export function dec(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}


export function toMoney(value: number): number {
  return Number(value.toFixed(8));
}

export const D = { num, dec, toMoney };
