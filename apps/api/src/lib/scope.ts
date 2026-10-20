import type { Prisma } from "@realbulls/db";
import { prisma } from "./prisma.js";
import { forbidden } from "./errors.js";

/**
 * Authorization context for admin routes.
 *
 * Roles:
 *  - SUPER_ADMIN  : unrestricted, global access across every tenant.
 *  - TENANT_ADMIN : may only see/manage the users they personally created
 *                   (plus their own account). Tenant-level access alone is
 *                   NOT enough — ownership is enforced in every Prisma query.
 *  - TRADER       : no admin access at all (rejected by requireRole).
 */
export interface AdminScope {
  sub: string;
  role: "SUPER_ADMIN" | "TENANT_ADMIN" | "TRADER";
  tenantId: string;
}

export function isSuperAdmin(auth: AdminScope): boolean {
  return auth.role === "SUPER_ADMIN";
}

/**
 * Returns the `where` fragment that restricts a User query to the rows the
 * caller is allowed to see.
 *
 * SUPER_ADMIN  -> `{}` (no restriction).
 * TENANT_ADMIN -> `createdById = auth.sub` (users they personally created).
 */
export function createdByUserWhere(auth: AdminScope): Prisma.UserWhereInput {
  if (isSuperAdmin(auth)) return {};
  return { createdById: auth.sub };
}

/**
 * Throws unless the caller may manage the given target user.
 *
 * SUPER_ADMIN  -> always allowed.
 * TENANT_ADMIN -> allowed only for users they created (self is allowed too, so
 *                 that an admin can still adjust their own profile).
 */
export function assertManagesUser(
  auth: AdminScope,
  target: { id: string; createdById: string | null },
): void {
  if (isSuperAdmin(auth)) return;
  if (target.id === auth.sub) return;
  if (target.createdById === auth.sub) return;
  throw forbidden("You can only manage users you created");
}

/**
 * Resolves the set of user ids a tenant admin is allowed to see.
 * Super admins get `null`, meaning "unrestricted".
 */
export async function visibleUserIds(auth: AdminScope): Promise<string[] | null> {
  if (isSuperAdmin(auth)) return null;
  const rows = await prisma.user.findMany({
    where: { OR: [{ createdById: auth.sub }, { id: auth.sub }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Resolves the set of account ids a tenant admin is allowed to see.
 * Super admins get `null`, meaning "unrestricted".
 */
export async function visibleAccountIds(auth: AdminScope): Promise<string[] | null> {
  if (isSuperAdmin(auth)) return null;
  const userIds = await visibleUserIds(auth);
  if (userIds === null) return null;
  if (userIds.length === 0) return [];
  const accounts = await prisma.account.findMany({
    where: { userId: { in: userIds }, isHouse: false },
    select: { id: true },
  });
  return accounts.map((a) => a.id);
}

/**
 * A `where` fragment restricting an Account query to the accounts the caller
 * may see. Returns `null` when the caller is unrestricted (super admin).
 */
export async function ownedAccountFilter(
  auth: AdminScope,
): Promise<Prisma.AccountWhereInput | null> {
  if (isSuperAdmin(auth)) return null;
  const userIds = await visibleUserIds(auth);
  return { userId: { in: userIds ?? [] }, isHouse: false };
}
