import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken, type AccessClaims } from "../lib/jwt.js";
import { unauthorized, forbidden } from "../lib/errors.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: AccessClaims;
  }
}

type Role = AccessClaims["role"];


export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized("Missing bearer token");
  try {
    request.auth = await verifyAccessToken(header.slice(7));
  } catch {
    throw unauthorized("Invalid or expired token");
  }
}


export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const auth = request.auth;
    if (!auth) throw unauthorized();
    if (!roles.includes(auth.role)) throw forbidden("Insufficient role");
  };
}


export function isGlobalAdmin(role: Role): boolean {
  return role === "SUPER_ADMIN";
}
