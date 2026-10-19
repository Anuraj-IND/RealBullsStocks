import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createTenantSchema } from "@realbulls/shared";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../plugins/auth.js";
import { notFound, conflict } from "../lib/errors.js";
import { D } from "../lib/money.js";

export default async function tenantRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRole("SUPER_ADMIN"));

  app.get("/admin/tenants", async () => {
    const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "asc" } });
    const out = [];
    for (const t of tenants) {
      const [users, accounts, positions] = await Promise.all([
        prisma.user.count({ where: { tenantId: t.id, email: { not: { endsWith: ".internal" } } } }),
        prisma.account.count({ where: { tenantId: t.id, isHouse: false } }),
        prisma.position.count({ where: { tenantId: t.id, status: "OPEN" } }),
      ]);
      out.push({ ...t, stats: { users, accounts, openPositions: positions } });
    }
    return { tenants: out };
  });

  app.post("/admin/tenants", async (request, reply) => {
    const body = createTenantSchema.parse(request.body);
    const existing = await prisma.tenant.findFirst({ where: { OR: [{ slug: body.slug }, { domain: body.domain }] } });
    if (existing) throw conflict("Slug or domain already in use");

    const tenant = await prisma.tenant.create({
      data: {
        name: body.name,
        slug: body.slug,
        domain: body.domain,
        primaryColor: body.primaryColor ?? "#DC001C",
        accentColor: body.accentColor ?? "#FFCC00",
        background: body.background ?? "#0B132B",
      },
    });

    const systemUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `house@${tenant.slug}.internal`,
        passwordHash: "!",
        role: "TRADER",
        displayName: "HOUSE",
        status: "SUSPENDED",
      },
    });
    await prisma.account.create({ data: { userId: systemUser.id, tenantId: tenant.id, type: "DEMO", isHouse: true } });

    await prisma.auditLog.create({ data: { tenantId: tenant.id, actorId: request.auth!.sub, action: "TENANT_CREATE", targetType: "Tenant", targetId: tenant.id, after: body } });
    reply.code(201);
    return tenant;
  });

  const patchTenantSchema = z.object({
    name: z.string().min(2).optional(),
    domain: z.string().min(3).optional(),
    logoUrl: z.string().url().nullable().optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED", "PENDING"]).optional(),
  });

  app.patch("/admin/tenants/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = patchTenantSchema.parse(request.body);
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw notFound("Tenant not found");
    const updated = await prisma.tenant.update({ where: { id }, data: body });
    await prisma.auditLog.create({ data: { tenantId: id, actorId: request.auth!.sub, action: "TENANT_UPDATE", targetType: "Tenant", targetId: id, after: body } });
    return updated;
  });

  app.get("/admin/tenants/:id/metrics", async (request) => {
    const { id } = request.params as { id: string };
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw notFound("Tenant not found");
    const [users, openPositions, closedPositions, depositAgg, accounts] = await Promise.all([
      prisma.user.count({ where: { tenantId: id, email: { not: { endsWith: ".internal" } } } }),
      prisma.position.count({ where: { tenantId: id, status: "OPEN" } }),
      prisma.position.findMany({ where: { tenantId: id, status: { in: ["CLOSED", "LIQUIDATED"] } }, select: { realizedPnl: true } }),
      prisma.ledgerEntry.aggregate({ where: { tenantId: id, type: "DEPOSIT", direction: "CREDIT" }, _sum: { amount: true } }),
      prisma.account.findMany({ where: { tenantId: id, isHouse: false }, select: { balance: true } }),
    ]);
    const netPnl = closedPositions.reduce((acc, p) => acc + D.num(p.realizedPnl), 0);
    const totalBalance = accounts.reduce((acc, a) => acc + D.num(a.balance), 0);
    return {
      users,
      openPositions,
      closedPositions: closedPositions.length,
      netPnl: D.toMoney(netPnl),
      deposits: D.num(depositAgg._sum.amount),
      totalBalance: D.toMoney(totalBalance),
    };
  });
}
