import type { FastifyInstance } from "fastify";
import { requireTenant } from "../lib/tenant.js";


export default async function publicRoutes(app: FastifyInstance) {
  app.get("/public/tenant", async (request) => {
    const tenant = await requireTenant(request);
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      logoUrl: tenant.logoUrl,
      primaryColor: tenant.primaryColor,
      accentColor: tenant.accentColor,
      background: tenant.background,
      themeJson: tenant.themeJson,
    };
  });
}
