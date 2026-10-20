import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";

const TOKEN_KEY = "zerodha:access_token";
const USER_KEY = "zerodha:user_id";
const CONNECTED_AT_KEY = "zerodha:connected_at";
const CONNECT_STATE_KEY = "broker:connect";
const CONNECT_TTL_SECONDS = 10 * 60;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const TOKEN_EXPIRY_HOUR_IST = 6;

export interface BrokerStatus {
  configured: boolean;
  connected: boolean;
  connectedAt: string | null;
  userId: string | null;
}

interface ConnectState {
  userId: string;
  returnTo: string;
}

function nextTokenExpiry(connectedAt: Date): number {
  const ist = new Date(connectedAt.getTime() + IST_OFFSET_MS);
  const expiryIst = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate() + 1,
    TOKEN_EXPIRY_HOUR_IST,
    0,
    0,
  );
  return expiryIst - IST_OFFSET_MS;
}

function tokenFresh(connectedAt: string | null): boolean {
  if (!connectedAt) return true;
  const parsed = new Date(connectedAt);
  if (Number.isNaN(parsed.getTime())) return true;
  return Date.now() < nextTokenExpiry(parsed);
}

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/terminal";
  return value.slice(0, 200);
}

export async function getBrokerStatus(): Promise<BrokerStatus> {
  const [token, connectedAt, userId] = await Promise.all([
    redis.get(TOKEN_KEY),
    redis.get(CONNECTED_AT_KEY),
    redis.get(USER_KEY),
  ]);
  const connected = Boolean(token) && tokenFresh(connectedAt);
  return {
    configured: Boolean(process.env.ZERODHA_API_KEY && process.env.ZERODHA_API_SECRET),
    connected,
    connectedAt: connected ? connectedAt : null,
    userId: connected ? userId : null,
  };
}

export async function isBrokerConnected(): Promise<boolean> {
  return (await getBrokerStatus()).connected;
}

export async function createBrokerConnectState(userId: string, returnTo: string): Promise<string> {
  const state = randomBytes(24).toString("hex");
  const payload: ConnectState = { userId, returnTo: safeReturnTo(returnTo) };
  await redis.set(`${CONNECT_STATE_KEY}:${state}`, JSON.stringify(payload), "EX", CONNECT_TTL_SECONDS);
  return state;
}

export async function consumeBrokerConnectState(state: string | undefined): Promise<ConnectState | null> {
  if (!state) return null;
  const key = `${CONNECT_STATE_KEY}:${state}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);

  let payload: ConnectState;
  try {
    payload = JSON.parse(raw) as ConnectState;
  } catch {
    return null;
  }
  if (!payload.userId) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true, status: true } });
  if (!user || user.status !== "ACTIVE" || user.role !== "SUPER_ADMIN") return null;
  return { userId: payload.userId, returnTo: safeReturnTo(payload.returnTo) };
}

export async function saveBrokerSession(token: string, userId: string | undefined): Promise<void> {
  const connectedAt = new Date().toISOString();
  await redis
    .multi()
    .set(TOKEN_KEY, token)
    .set(USER_KEY, userId ?? "")
    .set(CONNECTED_AT_KEY, connectedAt)
    .exec();
}

export async function clearBrokerSession(): Promise<void> {
  await redis.del(TOKEN_KEY, USER_KEY, CONNECTED_AT_KEY);
}
