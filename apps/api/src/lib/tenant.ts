import type { FastifyRequest } from "fastify";
import type { Tenant } from "@realbulls/db";
import { prisma } from "./prisma.js";

function hostOf(request: FastifyRequest): string {
  const raw = (request.headers.host ?? "").toString();
  return raw.split(":")[0] ?? "";
}


export async function resolveTenant(request: FastifyRequest): Promise<Tenant | null> {
  const headerSlug = request.headers["x-tenant"];
  const query = request.query as Record<string, unknown> | undefined;
  const slug = (typeof headerSlug === "string" ? headerSlug : undefined) ?? (typeof query?.tenant === "string" ? query.tenant : undefined);
  if (slug) {
    const bySlug = await prisma.tenant.findUnique({ where: { slug } });
    if (bySlug) return bySlug;
  }
  const domainQuery = typeof query?.domain === "string" ? query.domain : undefined;
  if (domainQuery) {
    const byDomain = await prisma.tenant.findFirst({ where: { domain: domainQuery.split(":")[0] } });
    if (byDomain) return byDomain;
  }
  const host = hostOf(request);
  if (host) {
    const byDomain = await prisma.tenant.findFirst({ where: { domain: host } });
    if (byDomain) return byDomain;
  }
  return null;
}


export async function defaultTenant(): Promise<Tenant | null> {
  return prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
}

export async function requireTenant(request: FastifyRequest): Promise<Tenant> {
  const tenant = (await resolveTenant(request)) ?? (await defaultTenant());
  if (!tenant) throw new Error("No tenant configured");
  return tenant;
}
