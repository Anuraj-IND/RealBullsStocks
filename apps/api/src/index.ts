import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";
import { HttpError } from "./lib/errors.js";
import { publishRegistry } from "./services/market.service.js";
import { startPnlWorker, stopPnlWorker } from "./services/pnl.worker.js";
import authRoutes from "./routes/auth.js";
import oauthRoutes from "./routes/oauth.js";
import marketRoutes from "./routes/market.js";
import instrumentRoutes from "./routes/instruments.js";
import tradingRoutes from "./routes/trading.js";
import ledgerRoutes from "./routes/ledger.js";
import adminRoutes from "./routes/admin.js";
import tenantRoutes from "./routes/tenants.js";
import publicRoutes from "./routes/public.js";
import brokerRoutes from "./routes/broker.js";
import alertRoutes from "./routes/alerts.js";
import notificationRoutes from "./routes/notifications.js";
import { startCandleWorker, stopCandleWorker } from "./services/candle.worker.js";
import { startAlertWorker, stopAlertWorker } from "./services/alert.worker.js";
import { startInstrumentSync } from "./services/instrument.service.js";
import { startMarketCloseSync, stopMarketCloseSync } from "./services/market-close.service.js";
import { startQuoteBridge, stopQuoteBridge } from "./services/quote-bridge.worker.js";

async function main() {
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: env.isProd ? "info" : "debug",
      transport: env.isProd ? undefined : { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
    },
  });

  await app.register(cors, {
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
    credentials: true,
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-XSS-Protection", "0");
    reply.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    const forwardedProto = String(request.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim();
    if (env.isProd && (request.protocol === "https" || forwardedProto === "https")) {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    return payload;
  });
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (!body || body.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    const out: Record<string, string> = {};
    for (const pair of String(body).split("&")) {
      if (!pair) continue;
      const [k, v] = pair.split("=");
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    }
    done(null, out);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "ValidationError", issues: error.issues });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.code ?? error.name, message: error.message });
    }
    if ((error as { code?: string }).code === "P2002") {
      return reply.code(409).send({ error: "Conflict", message: "Unique constraint violated" });
    }
    const httpErr = error as { statusCode?: number; name?: string; message?: string };
    if (typeof httpErr.statusCode === "number" && httpErr.statusCode >= 400 && httpErr.statusCode < 500) {
      return reply.code(httpErr.statusCode).send({ error: httpErr.name ?? "ClientError", message: httpErr.message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "InternalError", message: "Something went wrong" });
  });

  app.get("/health", async () => ({ status: "ok", service: "realbulls-api", ts: Date.now() }));

  await app.register(authRoutes);
  await app.register(oauthRoutes);
  await app.register(publicRoutes);
  await app.register(brokerRoutes);
  await app.register(marketRoutes);
  await app.register(instrumentRoutes);
  await app.register(tradingRoutes);
  await app.register(ledgerRoutes);
  await app.register(alertRoutes);
  await app.register(notificationRoutes);
  await app.register(adminRoutes);
  await app.register(tenantRoutes);

  await app.listen({ port: env.port, host: "0.0.0.0" });

  await publishRegistry().catch((err) => app.log.warn({ err }, "registry publish failed"));
  startPnlWorker();
  startCandleWorker();
  startAlertWorker();
  startInstrumentSync();
  startMarketCloseSync();
  startQuoteBridge();
  const registryTimer = setInterval(() => {
    void publishRegistry().catch(() => undefined);
  }, 30000);
  registryTimer.unref?.();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    clearInterval(registryTimer);
    stopPnlWorker();
    stopCandleWorker();
    stopAlertWorker();
    stopMarketCloseSync();
    stopQuoteBridge();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
