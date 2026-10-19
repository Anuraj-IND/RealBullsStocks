import { prisma } from "./prisma.js";


export function slugBase(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  return s || "user";
}


export async function uniqueUsername(tenantId: string, base: string): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    const exists = await prisma.user.findUnique({ where: { tenantId_username: { tenantId, username: candidate } } });
    if (!exists) return candidate;
  }
  return `${base}${Date.now().toString().slice(-6)}`;
}
