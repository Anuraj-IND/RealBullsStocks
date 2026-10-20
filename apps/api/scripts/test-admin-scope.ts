/**
 * End-to-end authorization test for role-based admin isolation.
 *
 * Boots a Fastify instance with only the auth + admin routes registered
 * (no workers, no market feeds) and exercises the real HTTP surface.
 *
 * Run with:
 *   cd apps/api && pnpm exec tsx scripts/test-admin-scope.ts
 */
import "dotenv/config";
import Fastify from "fastify";
import { ZodError } from "zod";
import { prisma } from "@realbulls/db";
import { HttpError } from "../src/lib/errors.js";
import authRoutes from "../src/routes/auth.js";
import adminRoutes from "../src/routes/admin.js";

const app = Fastify({ logger: false });
app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
  if (!body || body.length === 0) return done(null, {});
  try {
    done(null, JSON.parse(body as string));
  } catch (err) {
    done(err as Error, undefined);
  }
});
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) return reply.code(400).send({ error: "ValidationError" });
  if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.name, message: error.message });
  return reply.code(500).send({ error: "InternalError", message: error.message });
});
await app.register(authRoutes);
await app.register(adminRoutes);
await app.ready();

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

async function login(email: string, password = "password123") {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { identifier: email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed for ${email}: ${res.statusCode} ${res.body}`);
  return JSON.parse(res.body) as { accessToken: string; user: { id: string; role: string } };
}

const call = (token: string, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as "GET", url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

// ---------------------------------------------------------------- fixtures
const superAdmin = await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
const tenantAdmin = await prisma.user.findFirstOrThrow({ where: { role: "TENANT_ADMIN" } });
const tenantAdminOwned = await prisma.user.findFirstOrThrow({ where: { createdById: tenantAdmin.id } });
const foreignTrader = await prisma.user.findFirstOrThrow({
  where: { role: "TRADER", createdById: { not: tenantAdmin.id }, email: { not: { endsWith: ".internal" } } },
});

console.log("\n=== fixtures ===");
console.log(`super admin      : ${superAdmin.email}`);
console.log(`tenant admin     : ${tenantAdmin.email}`);
console.log(`owned by TA      : ${tenantAdminOwned.email}`);
console.log(`NOT owned by TA  : ${foreignTrader.email}\n`);

const superTok = (await login(superAdmin.email)).accessToken;
const tenantTok = (await login(tenantAdmin.email)).accessToken;

// ---------------------------------------------------------------- 1. lists
console.log("\n1. GET /admin/users - tenant admin sees only the clients they created");
{
  const res = await call(tenantTok, "GET", "/admin/users");
  const body = JSON.parse(res.body) as { users: Array<{ id: string; email: string }> };
  const ids = body.users.map((u) => u.id);
  check("status 200", res.statusCode === 200, res.statusCode);
  check("includes owned user", ids.includes(tenantAdminOwned.id), ids);
  check("EXCLUDES own admin account", !ids.includes(tenantAdmin.id), ids);
  check("EXCLUDES foreign trader", !ids.includes(foreignTrader.id), ids);
  check("EXCLUDES super admin", !ids.includes(superAdmin.id), ids);
}

console.log("\n2. GET /admin/users - super admin sees everyone");
{
  const res = await call(superTok, "GET", "/admin/users");
  const body = JSON.parse(res.body) as { users: Array<{ id: string }> };
  const ids = body.users.map((u) => u.id);
  check("status 200", res.statusCode === 200);
  check("includes super admin", ids.includes(superAdmin.id));
  check("includes tenant admin", ids.includes(tenantAdmin.id));
  check("includes foreign trader", ids.includes(foreignTrader.id));
}

console.log("\n3. GET /admin/users?q= - search cannot escape the owner scope");
{
  const res = await call(tenantTok, "GET", `/admin/users?q=${encodeURIComponent(foreignTrader.email)}`);
  const body = JSON.parse(res.body) as { users: Array<{ id: string }> };
  check("status 200", res.statusCode === 200);
  check("search for foreign user returns nothing", body.users.length === 0, body.users);
}

// ---------------------------------------------------------------- 2. detail
console.log("\n4. GET /admin/users/:id/detail - ownership enforced");
{
  const own = await call(tenantTok, "GET", `/admin/users/${tenantAdminOwned.id}/detail`);
  check("200 for owned user", own.statusCode === 200, own.statusCode);
  const foreign = await call(tenantTok, "GET", `/admin/users/${foreignTrader.id}/detail`);
  check("403 for foreign user", foreign.statusCode === 403, foreign.statusCode);
  const sup = await call(tenantTok, "GET", `/admin/users/${superAdmin.id}/detail`);
  check("403 for super admin", sup.statusCode === 403, sup.statusCode);
  const bySuper = await call(superTok, "GET", `/admin/users/${foreignTrader.id}/detail`);
  check("200 for super admin reading anyone", bySuper.statusCode === 200, bySuper.statusCode);
}



// ---------------------------------------------------------------- 3. mutate
console.log("\n5. PATCH /admin/users/:id - ownership enforced");
{
  const foreign = await call(tenantTok, "PATCH", `/admin/users/${foreignTrader.id}`, { status: "SUSPENDED" });
  check("403 patching foreign user", foreign.statusCode === 403, foreign.statusCode);
  const owned = await call(tenantTok, "PATCH", `/admin/users/${tenantAdminOwned.id}`, { displayName: "Owned Trader" });
  check("200 patching owned user", owned.statusCode === 200, owned.statusCode);
  const escalate = await call(tenantTok, "PATCH", `/admin/users/${tenantAdminOwned.id}`, { role: "TENANT_ADMIN" });
  check("403 escalating own user's role", escalate.statusCode === 403, escalate.statusCode);
  const bySuper = await call(superTok, "PATCH", `/admin/users/${foreignTrader.id}`, { displayName: "Foreign Trader" });
  check("200 super admin patches anyone", bySuper.statusCode === 200, bySuper.statusCode);
}

console.log("\n6. POST /admin/users - creator attribution + role limits");
{
  const created = await call(tenantTok, "POST", "/admin/users", { name: "Isolation Probe", role: "TRADER" });
  check("201 created", created.statusCode === 201, created.statusCode);
  const newUserId = (JSON.parse(created.body) as { id: string }).id;
  const row = await prisma.user.findUniqueOrThrow({ where: { id: newUserId }, select: { createdById: true } });
  check("createdById === tenant admin", row.createdById === tenantAdmin.id, row);

  const asAdmin = await call(tenantTok, "POST", "/admin/users", { name: "Sneaky Admin", role: "TENANT_ADMIN" });
  check("403 creating another tenant admin", asAdmin.statusCode === 403, asAdmin.statusCode);
  const asSuper = await call(tenantTok, "POST", "/admin/users", { name: "Sneaky Super", role: "SUPER_ADMIN" });
  check("403 creating a super admin", asSuper.statusCode === 403, asSuper.statusCode);

  // cleanup
  await prisma.account.deleteMany({ where: { userId: newUserId } });
  await prisma.watchlist.deleteMany({ where: { userId: newUserId } });
  await prisma.user.delete({ where: { id: newUserId } });
}


// ---------------------------------------------------------------- 4. reports
console.log("\n7. GET /admin/summary - tenant admin totals are owner-scoped");
{
  const res = await call(tenantTok, "GET", "/admin/summary");
  const body = JSON.parse(res.body) as { users: number; totalBalance: number };
  const ownedAccounts = await prisma.account.findMany({
    where: { user: { id: { in: [tenantAdmin.id, tenantAdminOwned.id] } }, isHouse: false },
    select: { balance: true },
  });
  const expected = ownedAccounts.reduce((a, c) => a + Number(c.balance), 0);
  check("status 200", res.statusCode === 200);
  check("user count is owner-scoped", body.users <= 2, body);
  check("balance matches owned accounts", Math.abs(body.totalBalance - expected) < 0.01, {
    got: body.totalBalance,
    expected,
  });
}

console.log("\n8. GET /admin/ledger + /admin/trades + /admin/positions - owner-scoped");
{
  const allowed = new Set(
    (
      await prisma.account.findMany({
        where: { user: { id: { in: [tenantAdmin.id, tenantAdminOwned.id] } }, isHouse: false },
        select: { id: true },
      })
    ).map((a) => a.id),
  );
  const ledger = JSON.parse((await call(tenantTok, "GET", "/admin/ledger")).body) as {
    entries: Array<{ accountId: string }>;
  };
  check("no foreign ledger entries", ledger.entries.every((e) => allowed.has(e.accountId)), ledger.entries.length);

  const trades = JSON.parse((await call(tenantTok, "GET", "/admin/trades?status=ALL")).body) as {
    trades: Array<{ email: string }>;
  };
  check(
    "no foreign trades",
    trades.trades.every((t) => t.email === tenantAdmin.email || t.email === tenantAdminOwned.email),
    trades.trades.slice(0, 3),
  );

  const positions = JSON.parse((await call(tenantTok, "GET", "/admin/positions")).body) as {
    positions: Array<{ email: string }>;
  };
  check(
    "no foreign positions",
    positions.positions.every((p) => p.email === tenantAdmin.email || p.email === tenantAdminOwned.email),
    positions.positions.slice(0, 3),
  );
}

console.log("\n9. GET /admin/audit - tenant admin sees only own actions");
{
  const res = await call(tenantTok, "GET", "/admin/audit");
  const body = JSON.parse(res.body) as { logs: Array<{ actorId: string | null }> };
  check("status 200", res.statusCode === 200);
  check("only own audit entries", body.logs.every((l) => l.actorId === tenantAdmin.id), body.logs.slice(0, 3));
}

console.log("\n10. Cross-tenant access is still denied");
{
  const otherTenant = (await prisma.tenant.findMany({ where: { id: { not: tenantAdmin.tenantId } } }))[0];
  const res = await call(tenantTok, "GET", `/admin/users?tenantId=${otherTenant.id}`);
  check("403 for other tenant id", res.statusCode === 403, res.statusCode);
}

console.log("\n11. PATCH /admin/accounts/:id and POST /admin/ledger/adjust - owner-scoped");
{
  const foreignAcct = await prisma.account.findFirstOrThrow({
    where: { userId: foreignTrader.id, isHouse: false },
  });
  const res = await call(tenantTok, "PATCH", `/admin/accounts/${foreignAcct.id}`, { status: "CLOSED" });
  check("403 status change on foreign account", res.statusCode === 403, res.statusCode);

  const adj = await call(tenantTok, "POST", "/admin/ledger/adjust", {
    accountId: foreignAcct.id,
    type: "DEPOSIT",
    amount: 1000,
  });
  check("403 ledger adjust on foreign account", adj.statusCode === 403, adj.statusCode);
}

console.log("\n12. PATCH /admin/tenant/segments - super admin only");
{
  const res = await call(tenantTok, "PATCH", "/admin/tenant/segments", { segments: ["FOREX"] });
  check("403 for tenant admin", res.statusCode === 403, res.statusCode);
  const sup = await call(superTok, "PATCH", "/admin/tenant/segments", { segments: ["FOREX"] });
  check("200 for super admin", sup.statusCode === 200, sup.statusCode);
}

console.log("\n13. Trader has no admin access at all");
{
  const traderTok = (await login(tenantAdminOwned.email)).accessToken;
  const res = await call(traderTok, "GET", "/admin/users");
  check("403 for trader", res.statusCode === 403, res.statusCode);
}

console.log("\n14. Platform-wide config endpoints - super admin only");
{
  const lev = await call(tenantTok, "PUT", "/admin/leverage", {
    scope: "ASSET_CLASS",
    assetClass: "FOREX",
    maxLeverage: 50,
    marginCallPct: 100,
    stopOutPct: 5,
  });
  check("403 leverage rule for tenant admin", lev.statusCode === 403, lev.statusCode);

  const asset = await prisma.asset.findFirstOrThrow();
  const cfg = await call(tenantTok, "PUT", "/admin/assets/config", {
    tenantId: tenantAdmin.tenantId,
    assetId: asset.id,
    commissionPerLot: 9,
  });
  check("403 asset config for tenant admin", cfg.statusCode === 403, cfg.statusCode);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
await app.close();
await prisma.$disconnect();
process.exit(fail > 0 ? 1 : 0);
