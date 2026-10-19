import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { redis } from "../lib/redis.js";
import { authenticate } from "../plugins/auth.js";
import { env } from "../env.js";

const KITE_API = "https://api.kite.trade";
const KITE_LOGIN = "https://kite.zerodha.com/connect/login";


export default async function brokerRoutes(app: FastifyInstance) {
  app.get("/broker/zerodha/login", async (request, reply) => {
    if (!env.zerodha.apiKey) return reply.code(400).send({ error: "ZerodhaNotConfigured", message: "ZERODHA_API_KEY is not set" });
    return reply.redirect(`${KITE_LOGIN}?api_key=${encodeURIComponent(env.zerodha.apiKey)}&v=3`);
  });

  const callback = async (request: FastifyRequest, reply: FastifyReply) => {
    const { request_token, status } = request.query as { request_token?: string; status?: string };
    const back = (q: string) => reply.redirect(`${env.oauth.webUrl}/settings?broker=${q}`);
    if (status !== "success" || !request_token || !env.zerodha.apiKey || !env.zerodha.apiSecret) return back("error");

    const checksum = createHash("sha256").update(env.zerodha.apiKey + request_token + env.zerodha.apiSecret).digest("hex");
    const body = new URLSearchParams({ api_key: env.zerodha.apiKey, request_token, checksum });
    try {
      const res = await fetch(`${KITE_API}/session/token`, {
        method: "POST",
        headers: { "X-Kite-Version": "3", "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = (await res.json()) as { status?: string; data?: { access_token?: string; user_id?: string } };
      if (data.status === "success" && data.data?.access_token) {
        await redis.set("zerodha:access_token", data.data.access_token);
        await redis.set("zerodha:user_id", data.data.user_id ?? "");
        await redis.set("zerodha:connected_at", new Date().toISOString());
        return back("connected");
      }
    } catch {
      
    }
    return back("error");
  };

  app.get("/broker/zerodha/callback", callback);
  app.get("/auth/oauth/zerodha/callback", callback);

  app.get("/broker/zerodha/status", { preHandler: authenticate }, async () => {
    const token = await redis.get("zerodha:access_token");
    const userId = await redis.get("zerodha:user_id");
    const connectedAt = await redis.get("zerodha:connected_at");
    return {
      configured: Boolean(env.zerodha.apiKey && env.zerodha.apiSecret),
      connected: Boolean(token),
      userId: userId || null,
      connectedAt: connectedAt || null,
    };
  });
}
