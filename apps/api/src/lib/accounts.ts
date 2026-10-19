import { prisma } from "./prisma.js";
import { notFound } from "./errors.js";


export async function primaryAccount(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, isHouse: false },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  if (!account) throw notFound("No trading account for user");
  return account;
}


export async function ownAccount(userId: string, accountId: string) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.userId !== userId) throw notFound("Account not found");
  return account;
}
