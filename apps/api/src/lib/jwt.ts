import { SignJWT, jwtVerify } from "jose";
import { env } from "../env.js";

export interface AccessClaims {
  sub: string; 
  tenantId: string;
  role: "SUPER_ADMIN" | "TENANT_ADMIN" | "TRADER";
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ tenantId: claims.tenantId, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.jwt.accessTtl}s`)
    .sign(env.jwt.accessSecret);
}

export async function signRefreshToken(userId: string, jti: string): Promise<string> {
  return new SignJWT({ typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${env.jwt.refreshTtl}s`)
    .sign(env.jwt.refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, env.jwt.accessSecret);
  return {
    sub: String(payload.sub),
    tenantId: String(payload.tenantId),
    role: payload.role as AccessClaims["role"],
  };
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string; jti: string }> {
  const { payload } = await jwtVerify(token, env.jwt.refreshSecret);
  return { sub: String(payload.sub), jti: String(payload.jti) };
}
