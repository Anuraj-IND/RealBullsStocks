import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { env } from "../env.js";
import { badRequest } from "../lib/errors.js";
import { authenticate, requireRole } from "../plugins/auth.js";
import {
  consumeBrokerConnectState,
  createBrokerConnectState,
  getBrokerStatus,
  safeReturnTo,
  saveBrokerSession,
} from "../services/broker.service.js";

const KITE_API = "https://api.kite.trade";
const KITE_LOGIN = "https://kite.zerodha.com/connect/login";

function kiteLoginUrl(state: string): string {
  const params = encodeURIComponent(`state=${state}`);
  return `${KITE_LOGIN}?api_key=${encodeURIComponent(env.zerodha.apiKey)}&v=3&redirect_params=${params}`;
}

function appUrl(returnTo: string, market: "connected" | "error"): string {
  const sep = returnTo.includes("?") ? "&" : "?";
  return `${env.oauth.webUrl}${returnTo}${sep}market=${market}`;
}

export default async function brokerRoutes(app: FastifyInstance) {
  app.post("/broker/connect", { preHandler: [authenticate, requireRole("SUPER_ADMIN")] }, async (request) => {
    if (!env.zerodha.apiKey || !env.zerodha.apiSecret) {
      throw badRequest("Market data is not configured", "MarketDataNotConfigured");
    }
    const body = (request.body ?? {}) as { returnTo?: string };
    const state = await createBrokerConnectState(request.auth!.sub, safeReturnTo(body.returnTo));
    return { url: kiteLoginUrl(state) };
  });

  const callback = async (request: FastifyRequest, reply: FastifyReply) => {
    const { request_token, status, state } = request.query as {
      request_token?: string;
      status?: string;
      state?: string;
    };

    const pending = await consumeBrokerConnectState(state);
    if (!pending) return reply.redirect(appUrl("/terminal", "error"));
    if (status !== "success" || !request_token || !env.zerodha.apiKey || !env.zerodha.apiSecret) {
      return reply.redirect(appUrl(pending.returnTo, "error"));
    }

    const checksum = createHash("sha256")
      .update(env.zerodha.apiKey + request_token + env.zerodha.apiSecret)
      .digest("hex");
    const body = new URLSearchParams({
      api_key: env.zerodha.apiKey,
      request_token,
      checksum,
    });

    try {
      const res = await fetch(`${KITE_API}/session/token`, {
        method: "POST",
        headers: { "X-Kite-Version": "3", "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = (await res.json()) as { status?: string; data?: { access_token?: string; user_id?: string } };
      if (data.status === "success" && data.data?.access_token) {
        await saveBrokerSession(data.data.access_token, data.data.user_id);
        return reply.redirect(appUrl(pending.returnTo, "connected"));
      }
    } catch {
      // Fall through to the generic error redirect.
    }
    return reply.redirect(appUrl(pending.returnTo, "error"));
  };

  app.get("/broker/zerodha/callback", callback);
  app.get("/auth/oauth/zerodha/callback", callback);

  const status = async () => {
    const s = await getBrokerStatus();
    return { configured: s.configured, connected: s.connected, connectedAt: s.connectedAt };
  };

  app.get("/broker/status", { preHandler: authenticate }, status);
  app.get("/broker/zerodha/status", { preHandler: authenticate }, status);
}
