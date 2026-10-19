import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loginSchema, registerSchema } from "@realbulls/shared";
import { prisma } from "../lib/prisma.js";
import { verifyPassword, hashPassword } from "../lib/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt.js";
import { sha256, newJti } from "../lib/crypto.js";
import { slugBase, uniqueUsername } from "../lib/usernames.js";
import { unauthorized, notFound, badRequest, conflict, HttpError } from "../lib/errors.js";
import { resolveTenant } from "../lib/tenant.js";
import { authenticate } from "../plugins/auth.js";
import { postLedgerChanges } from "../services/ledger.service.js";
import { D } from "../lib/money.js";
import { redis } from "../lib/redis.js";
import { env } from "../env.js";

const MAX_LOGIN_FAILS = 8;
const LOGIN_LOCK_SECONDS = 900;

function publicUser(user: {
  id: string;
  email: string;
  username: string | null;
  role: string;
  displayName: string | null;
  tenantId: string;
  status: string;
  locale: string;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    displayName: user.displayName,
    tenantId: user.tenantId,
    status: user.status,
    locale: user.locale,
  };
}

function accountDto(a: {
  id: string;
  type: string;
  baseCurrency: string;
  balance: unknown;
  marginUsed: unknown;
  status: string;
  isPrimary: boolean;
}) {
  return {
    id: a.id,
    type: a.type,
    baseCurrency: a.baseCurrency,
    balance: D.num(a.balance as never),
    marginUsed: D.num(a.marginUsed as never),
    status: a.status,
    isPrimary: a.isPrimary,
  };
}

async function issueSession(user: { id: string; tenantId: string; role: string }, ip: string | undefined, userAgent: string | undefined) {
  const accessToken = await signAccessToken({ sub: user.id, tenantId: user.tenantId, role: user.role as never });
  const jti = newJti();
  const refreshToken = await signRefreshToken(user.id, jti);
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshHash: sha256(jti),
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt: new Date(Date.now() + env.jwt.refreshTtl * 1000),
    },
  });
  return { accessToken, refreshToken };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request) => {
    const body = loginSchema.parse(request.body);
    const tenant = await resolveTenant(request);
    const identifier = (body.identifier ?? body.email ?? "").trim();

    const failKey = `login:fail:${identifier.toLowerCase()}:${request.ip}`;
    const fails = Number((await redis.get(failKey)) ?? 0);
    if (fails >= MAX_LOGIN_FAILS) throw new HttpError(429, "Too many failed attempts. Try again later.");

    const identifierWhere = { OR: [{ email: identifier }, { username: identifier }] };
    const user =
      (tenant ? await prisma.user.findFirst({ where: { tenantId: tenant.id, ...identifierWhere } }) : null) ??
      (await prisma.user.findFirst({ where: identifierWhere, orderBy: { createdAt: "asc" } }));

    const ok = user ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || user.status !== "ACTIVE" || !ok) {
      await redis.multi().incr(failKey).expire(failKey, LOGIN_LOCK_SECONDS).exec();
      throw unauthorized("Invalid credentials");
    }
    await redis.del(failKey);

    const tokens = await issueSession(user, request.ip, request.headers["user-agent"]);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: request.ip } });
    await prisma.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, action: "LOGIN", ip: request.ip } });

    const tenantRecord = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    const accounts = await prisma.account.findMany({ where: { userId: user.id, isHouse: false } });

    return { ...tokens, user: publicUser(user), tenant: tenantRecord, accounts: accounts.map(accountDto) };
  });

  app.post("/auth/register", async (request, reply) => {
    if (!env.allowSignup) throw new HttpError(403, "Registration is disabled");
    const body = registerSchema.parse(request.body);
    const email = body.email.toLowerCase();

    const tenant = (await resolveTenant(request)) ?? (await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } }));
    if (!tenant) throw new HttpError(500, "No tenant available");

    const existing = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } });
    if (existing) throw conflict("An account with this email already exists");

    const username = await uniqueUsername(tenant.id, slugBase(body.name));
    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: { tenantId: tenant.id, email, username, passwordHash, displayName: body.name, role: "TRADER", status: "ACTIVE" },
    });
    const account = await prisma.account.create({
      data: { userId: user.id, tenantId: tenant.id, type: "DEMO", baseCurrency: "USD", balance: 0, isPrimary: true },
    });
    if (env.signupStartingBalance > 0) {
      await postLedgerChanges(account.id, [{ type: "DEPOSIT", delta: env.signupStartingBalance, memo: "Welcome balance" }], { createdBy: "signup" });
    }
    await prisma.watchlist.create({ data: { userId: user.id, name: "Default" } });
    await prisma.auditLog.create({ data: { tenantId: tenant.id, actorId: user.id, action: "REGISTER", ip: request.ip } });

    const tokens = await issueSession(user, request.ip, request.headers["user-agent"]);
    const fresh = await prisma.account.findUnique({ where: { id: account.id } });
    reply.code(201);
    return { ...tokens, user: publicUser(user), tenant, accounts: [accountDto(fresh ?? account)] };
  });

  app.post("/auth/refresh", async (request) => {
    const body = request.body as { refreshToken?: string };
    if (!body?.refreshToken) throw unauthorized("Missing refresh token");
    let sub: string;
    let jti: string;
    try {
      ({ sub, jti } = await verifyRefreshToken(body.refreshToken));
    } catch {
      throw unauthorized("Invalid refresh token");
    }
    const session = await prisma.session.findFirst({
      where: { userId: sub, refreshHash: sha256(jti), revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!session) throw unauthorized("Session expired");

    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user || user.status !== "ACTIVE") throw unauthorized("Invalid user");

    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const tokens = await issueSession(user, request.ip, request.headers["user-agent"]);
    return tokens;
  });

  app.post("/auth/logout", async (request) => {
    const body = request.body as { refreshToken?: string };
    if (body?.refreshToken) {
      try {
        const { sub, jti } = await verifyRefreshToken(body.refreshToken);
        await prisma.session.updateMany({ where: { userId: sub, refreshHash: sha256(jti), revokedAt: null }, data: { revokedAt: new Date() } });
      } catch {
        
      }
    }
    return { ok: true };
  });

  app.get("/me", { preHandler: authenticate }, async (request) => {
    const auth = request.auth!;
    const user = await prisma.user.findUnique({ where: { id: auth.sub } });
    if (!user) throw notFound("User not found");
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
    const accounts = await prisma.account.findMany({ where: { userId: user.id, isHouse: false } });
    return { user: publicUser(user), tenant, accounts: accounts.map(accountDto) };
  });

  const patchMeSchema = z.object({
    displayName: z.string().min(1).max(80).optional(),
    locale: z.enum(["en", "hi"]).optional(),
  });

  app.patch("/me", { preHandler: authenticate }, async (request) => {
    const auth = request.auth!;
    const body = patchMeSchema.parse(request.body);
    const user = await prisma.user.update({ where: { id: auth.sub }, data: body });
    return { user: publicUser(user) };
  });

  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  });

  app.post("/me/password", { preHandler: authenticate }, async (request) => {
    const auth = request.auth!;
    const body = changePasswordSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: auth.sub } });
    if (!user) throw notFound("User not found");
    const ok = await verifyPassword(body.currentPassword, user.passwordHash);
    if (!ok) throw badRequest("Current password is incorrect");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
    await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, action: "PASSWORD_CHANGE", ip: request.ip } });
    return { ok: true };
  });
}
