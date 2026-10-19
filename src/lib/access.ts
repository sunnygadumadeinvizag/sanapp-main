import { prisma } from "@/lib/prisma";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

/**
 * Effective application access = direct grant ∪ role rule.
 *
 * A direct `UserApplication` row is a grant made to one person; a
 * `RoleApplication` row is a rule for a whole primary role. Both are resolved
 * at read time, so adding a user to a role gives them the role's apps at once —
 * there is no per-user copy to back-fill.
 *
 * Precedence: a direct grant always wins, so revoking an app from one person is
 * done by… not having a direct row. To *deny* someone a role-granted app you
 * would need an explicit deny, which this model deliberately does not have.
 */

export type EffectiveAccess = {
  allowed: boolean;
  role: "USER" | "APP_ADMIN";
  /** Where the access came from, for the admin UI. */
  source: "direct" | "role" | null;
};

/** The SSO primary role for a username, or null when the user is unknown. */
const ROLE_TTL_MS = 60_000;
const roleCache = new Map<string, { value: string | null; at: number }>();

export async function primaryRoleOf(username: string): Promise<string | null> {
  if (!username) return null;
  const key = username.trim().toLowerCase();

  // Access checks run on every app sign-in, so a short-lived cache keeps the
  // SSO from being asked the same question over and over.
  const hit = roleCache.get(key);
  if (hit && Date.now() - hit.at < ROLE_TTL_MS) return hit.value;

  const res = await fetch(
    `${SSO_BASE_URL}/api/admin/users?key=${encodeURIComponent(SSO_ADMIN_KEY)}&username=${encodeURIComponent(username)}`,
    { cache: "no-store" }
  ).catch(() => null);
  const value =
    res && res.ok
      ? (((await res.json().catch(() => ({}))) as { users?: { primaryRole?: string | null }[] })
          .users?.[0]?.primaryRole ?? null)
      : null;

  // A transient SSO failure is not cached, so the next check retries.
  if (res?.ok) roleCache.set(key, { value, at: Date.now() });
  return value;
}

/**
 * What this user may do on this application. Direct grants are read by id or
 * username (grants seeded before the SSO id was known have a null userId), and
 * role rules are matched on the user's SSO primary role.
 */
export async function effectiveAccess(opts: {
  applicationId: string;
  userId?: string | null;
  username: string;
  primaryRole?: string | null;
}): Promise<EffectiveAccess> {
  const direct = await prisma.userApplication.findFirst({
    where: {
      applicationId: opts.applicationId,
      OR: [
        ...(opts.userId ? [{ userId: opts.userId }] : []),
        { username: { equals: opts.username, mode: "insensitive" } },
      ],
    },
    select: { role: true },
  });
  if (direct) {
    return {
      allowed: true,
      role: direct.role === "APP_ADMIN" ? "APP_ADMIN" : "USER",
      source: "direct",
    };
  }

  // No role rules at all is the common case: skip asking the SSO for a primary
  // role that could not change the answer anyway.
  const ruleCount = await prisma.roleApplication.count();
  if (ruleCount === 0) return { allowed: false, role: "USER", source: null };

  const primaryRole = opts.primaryRole ?? (await primaryRoleOf(opts.username));
  if (!primaryRole) return { allowed: false, role: "USER", source: null };

  const rule = await prisma.roleApplication.findUnique({
    where: {
      primaryRole_applicationId: {
        primaryRole,
        applicationId: opts.applicationId,
      },
    },
    select: { role: true },
  });
  if (!rule) return { allowed: false, role: "USER", source: null };

  return {
    allowed: true,
    role: rule.role === "APP_ADMIN" ? "APP_ADMIN" : "USER",
    source: "role",
  };
}

/** The enabled applications this user may open: direct grants ∪ role rules. */
export async function accessibleApplications(opts: {
  userId?: string | null;
  username: string;
  primaryRole?: string | null;
}) {
  const directWhere = {
    OR: [
      ...(opts.userId ? [{ userId: opts.userId }] : []),
      { username: { equals: opts.username, mode: "insensitive" as const } },
    ],
  };

  // Only ask the SSO for the primary role when a rule actually exists.
  const ruleCount = await prisma.roleApplication.count();
  const primaryRole =
    ruleCount === 0 ? null : (opts.primaryRole ?? (await primaryRoleOf(opts.username)));

  return prisma.application.findMany({
    where: {
      enabled: true,
      OR: [
        { grants: { some: directWhere } },
        ...(primaryRole ? [{ roleGrants: { some: { primaryRole } } }] : []),
      ],
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      clientId: true,
      name: true,
      description: true,
      url: true,
      category: true,
      openInNewTab: true,
    },
  });
}
