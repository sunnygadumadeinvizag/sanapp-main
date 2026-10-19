import { prisma } from "@/lib/prisma";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

/**
 * Effective application access, resolved at read time from two kinds of row:
 *
 *  - `UserApplication` — a decision for one person on one app (`effect`
 *    ALLOW or DENY). This is the "direct" row.
 *  - `RoleApplication` — a decision for everyone whose SSO primary role matches
 *    (`effect` ALLOW or DENY, plus `overrideUsers`).
 *
 * Precedence, highest first:
 *   1. Role rule with `overrideUsers = true`  (role over user)
 *   2. Direct user row                        (user over role)
 *   3. Role rule with `overrideUsers = false` (role default)
 *   4. No row anywhere -> no access.
 *
 * A DENY at the winning level denies. A DENY that loses precedence has no
 * effect, which is what makes "role over user" meaningful: flipping the role
 * rule to override re-asserts the role's decision even where a user row exists.
 */

export type AccessEffect = "ALLOW" | "DENY";
export type AccessSource = "direct" | "role" | null;

export type EffectiveAccess = {
  allowed: boolean;
  role: "USER" | "APP_ADMIN";
  /** Where the decision came from, for the admin UI. */
  source: AccessSource;
  /** The raw decision, so the UI can explain "blocked by …". */
  effect: AccessEffect | null;
  /** True when the winning rule was a role rule set to override users. */
  overrodeUser: boolean;
};

const NO_ACCESS: EffectiveAccess = {
  allowed: false,
  role: "USER",
  source: null,
  effect: null,
  overrodeUser: false,
};

function normalizeEffect(value: unknown): AccessEffect {
  return String(value ?? "").toUpperCase() === "DENY" ? "DENY" : "ALLOW";
}

function normalizeRole(value: unknown): "USER" | "APP_ADMIN" {
  return String(value ?? "").toUpperCase() === "APP_ADMIN" ? "APP_ADMIN" : "USER";
}

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

/** Drop the cached primary role for a user (after an SSO role change). */
export function forgetPrimaryRole(username: string) {
  roleCache.delete(username.trim().toLowerCase());
}

/**
 * What this user may do on this application. Direct rows are matched by id or
 * username (grants seeded before the SSO id was known have a null userId);
 * role rules are matched on the user's SSO primary role.
 */
export async function effectiveAccess(opts: {
  applicationId: string;
  userId?: string | null;
  username: string;
  primaryRole?: string | null;
}): Promise<EffectiveAccess> {
  const directRows = await prisma.userApplication.findMany({
    where: {
      applicationId: opts.applicationId,
      OR: [
        ...(opts.userId ? [{ userId: opts.userId }] : []),
        { username: { equals: opts.username, mode: "insensitive" } },
      ],
    },
    select: { userId: true, role: true, effect: true },
  });
  // Prefer the row keyed by the SSO id when legacy username-only rows also exist.
  const direct =
    directRows.find((r) => opts.userId && r.userId === opts.userId) ?? directRows[0] ?? null;

  // No role rules at all is the common case: skip asking the SSO for a primary
  // role that could not change the answer anyway.
  const ruleCount = await prisma.roleApplication.count();
  let rule: { role: string; effect: string; overrideUsers: boolean } | null = null;
  if (ruleCount > 0) {
    const primaryRole = opts.primaryRole ?? (await primaryRoleOf(opts.username));
    if (primaryRole) {
      rule = await prisma.roleApplication.findUnique({
        where: {
          primaryRole_applicationId: {
            primaryRole,
            applicationId: opts.applicationId,
          },
        },
        select: { role: true, effect: true, overrideUsers: true },
      });
    }
  }

  // 1. A role rule that overrides users wins outright, even over a DENY.
  if (rule?.overrideUsers) {
    const effect = normalizeEffect(rule.effect);
    return {
      allowed: effect === "ALLOW",
      role: normalizeRole(rule.role),
      source: "role",
      effect,
      overrodeUser: true,
    };
  }

  // 2. A direct user row beats a non-overriding rule.
  if (direct) {
    const effect = normalizeEffect(direct.effect);
    return {
      allowed: effect === "ALLOW",
      role: normalizeRole(direct.role),
      source: "direct",
      effect,
      overrodeUser: false,
    };
  }

  // 3. The role's default decision, if any.
  if (rule) {
    const effect = normalizeEffect(rule.effect);
    return {
      allowed: effect === "ALLOW",
      role: normalizeRole(rule.role),
      source: "role",
      effect,
      overrodeUser: false,
    };
  }

  return NO_ACCESS;
}

/**
 * The enabled applications this user may open, applying the same precedence as
 * `effectiveAccess`: role rules that override users decide first, then direct
 * rows, then ordinary role rules. A winning DENY removes the app.
 */
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

  const applications = await prisma.application.findMany({
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
      grants: { where: directWhere, select: { userId: true, effect: true } },
      roleGrants: {
        where: primaryRole ? { primaryRole } : { primaryRole: "__none__" },
        select: { effect: true, overrideUsers: true },
        take: 1,
      },
    },
  });

  return applications
    .filter((app) => {
      const rule = app.roleGrants[0];
      const direct =
        app.grants.find((g) => opts.userId && g.userId === opts.userId) ?? app.grants[0];
      if (rule?.overrideUsers) return normalizeEffect(rule.effect) === "ALLOW";
      if (direct) return normalizeEffect(direct.effect) === "ALLOW";
      if (rule) return normalizeEffect(rule.effect) === "ALLOW";
      return false;
    })
    .map(({ grants: _g, roleGrants: _r, ...app }) => app);
}
