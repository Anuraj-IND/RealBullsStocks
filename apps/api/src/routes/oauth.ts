import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { signAccessToken, signRefreshToken } from "../lib/jwt.js";
import { sha256, newJti } from "../lib/crypto.js";
import { env } from "../env.js";

interface OAuthProfile {
  email: string;
  name: string | null;
  providerId: string;
}

const googleEnabled = () => Boolean(env.oauth.googleClientId && env.oauth.googleClientSecret);
const githubEnabled = () => Boolean(env.oauth.githubClientId && env.oauth.githubClientSecret);

function callbackUrl(provider: string): string {
  return `${env.oauth.apiBase}/auth/oauth/${provider}/callback`;
}

async function googleProfile(code: string): Promise<OAuthProfile> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.oauth.googleClientId,
      client_secret: env.oauth.googleClientSecret,
      redirect_uri: callbackUrl("google"),
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("google token exchange failed");
  const infoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const info = (await infoRes.json()) as { email?: string; name?: string; sub?: string };
  if (!info.email) throw new Error("google profile missing email");
  return { email: info.email.toLowerCase(), name: info.name ?? null, providerId: info.sub ?? "" };
}

async function githubProfile(code: string): Promise<OAuthProfile> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: env.oauth.githubClientId,
      client_secret: env.oauth.githubClientSecret,
      code,
      redirect_uri: callbackUrl("github"),
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("github token exchange failed");
  const headers = { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json", "user-agent": "realbulls" };
  const userRes = await fetch("https://api.github.com/user", { headers });
  const gh = (await userRes.json()) as { login?: string; name?: string; email?: string; id?: number };
  let email = gh.email ?? null;
  if (!email) {
    const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
    email = emails.find((e) => e.primary && e.verified)?.email ?? emails[0]?.email ?? null;
  }
  if (!email) throw new Error("github profile missing email");
  return { email: email.toLowerCase(), name: gh.name ?? gh.login ?? null, providerId: String(gh.id ?? "") };
}

export default async function oauthRoutes(app: FastifyInstance) {
  app.get("/auth/providers", async () => ({ google: googleEnabled(), github: githubEnabled() }));

  app.get("/auth/oauth/:provider", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    if (provider === "google" && googleEnabled()) {
      const q = new URLSearchParams({
        client_id: env.oauth.googleClientId,
        redirect_uri: callbackUrl("google"),
        response_type: "code",
        scope: "openid email profile",
        prompt: "select_account",
      });
      return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`);
    }
    if (provider === "github" && githubEnabled()) {
      const q = new URLSearchParams({
        client_id: env.oauth.githubClientId,
        redirect_uri: callbackUrl("github"),
        scope: "read:user user:email",
      });
      return reply.redirect(`https://github.com/login/oauth/authorize?${q.toString()}`);
    }
    return reply.code(400).send({ error: "ProviderNotConfigured", message: `${provider} sign-in is not configured` });
  });

  app.get("/auth/oauth/:provider/callback", async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const { code } = request.query as { code?: string };
    if (!code) return reply.code(400).send({ error: "MissingCode" });

    try {
      const profile = provider === "google" ? await googleProfile(code) : provider === "github" ? await githubProfile(code) : null;
      if (!profile) return reply.code(400).send({ error: "UnsupportedProvider" });

      const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
      if (!tenant) return reply.code(500).send({ error: "NoTenant" });

      let user = await prisma.user.findFirst({ where: { email: profile.email } });
      if (!user) {
        user = await prisma.user.create({
          data: { tenantId: tenant.id, email: profile.email, passwordHash: "!", displayName: profile.name, role: "TRADER", status: "ACTIVE" },
        });
        const account = await prisma.account.create({
          data: { userId: user.id, tenantId: tenant.id, type: "DEMO", baseCurrency: "USD", balance: 0, isPrimary: true },
        });
        await prisma.watchlist.create({ data: { userId: user.id, name: "Default" } });
        void account;
      }
      if (user.status !== "ACTIVE") return reply.redirect(`${env.oauth.webUrl}/login?error=suspended`);

      const jti = newJti();
      const accessToken = await signAccessToken({ sub: user.id, tenantId: user.tenantId, role: user.role as never });
      const refreshToken = await signRefreshToken(user.id, jti);
      await prisma.session.create({
        data: { userId: user.id, refreshHash: sha256(jti), expiresAt: new Date(Date.now() + env.jwt.refreshTtl * 1000) },
      });
      await prisma.auditLog.create({ data: { tenantId: user.tenantId, actorId: user.id, action: `LOGIN_${provider.toUpperCase()}`, ip: request.ip } });

      return reply.redirect(`${env.oauth.webUrl}/login/callback#access=${accessToken}&refresh=${refreshToken}`);
    } catch {
      return reply.redirect(`${env.oauth.webUrl}/login?error=oauth`);
    }
  });
}
