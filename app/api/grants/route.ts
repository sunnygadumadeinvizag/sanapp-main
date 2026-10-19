import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { forgetPrimaryRole } from "@/lib/access";

/**
 * POST { userId?, username, clientId, effect?, allowed?, role?, overrideRole? }
 *
 * Sets the direct per-user decision for one application:
 *   effect "ALLOW" — grant access
 *   effect "DENY"  — explicit block for this user
 *   effect "CLEAR" — remove the direct row (fall back to the role rule)
 *
 * `allowed` is kept for older callers: true -> ALLOW, false -> CLEAR.
 *
 * `overrideRole` (optional) also flips the role rule for this application so
 * the role wins over direct user rows ("role over user"). Leave it unset to
 * keep the normal precedence ("user over role").
 *
 * Requires a SUPER_ADMIN Main session.
 */
export async function POST(request: NextRequest) {
  const store = await cookies();
  const session = store.get("main_session")?.value || request.cookies.get("main_session")?.value;
  if (!session) {
    return NextResponse.json({ error: "unauthorized: main_session cookie missing" }, { status: 401 });
  }
  const me = await verifyMainSession(session);
  if (!me || me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "forbidden: superadmin role required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { userId, username, clientId, allowed, role, overrideRole } = body as {
    userId?: string;
    username: string;
    clientId: string;
    allowed?: boolean;
    role?: string;
    effect?: string;
    overrideRole?: boolean;
  };

  if (!username || !clientId) {
    return NextResponse.json({ error: "username and clientId required" }, { status: 400 });
  }

  const rawEffect = String((body as { effect?: string }).effect ?? "").toUpperCase();
  const effect =
    rawEffect === "ALLOW" || rawEffect === "DENY"
      ? rawEffect
      : allowed === true
        ? "ALLOW"
        : "CLEAR";

  const cleanUsername = username.trim().toLowerCase();
  const cleanClientId = clientId.trim().toLowerCase();

  const apps = await prisma.application.findMany();
  const application = apps.find(
    (a) => a.clientId.toLowerCase() === cleanClientId || a.id.toLowerCase() === cleanClientId
  );

  if (!application) {
    return NextResponse.json({ error: "application not found" }, { status: 404 });
  }

  const targetRole = role === "APP_ADMIN" ? "APP_ADMIN" : "USER";

  if (effect === "CLEAR") {
    await prisma.userApplication.deleteMany({
      where: {
        applicationId: application.id,
        username: { equals: cleanUsername, mode: "insensitive" },
      },
    });
  } else {
    const existing = await prisma.userApplication.findFirst({
      where: {
        applicationId: application.id,
        username: { equals: cleanUsername, mode: "insensitive" },
      },
    });
    if (!existing) {
      await prisma.userApplication.create({
        data: {
          userId: userId ?? null,
          username: cleanUsername,
          applicationId: application.id,
          role: targetRole,
          effect,
        },
      });
    } else {
      await prisma.userApplication.update({
        where: { id: existing.id },
        data: {
          role: targetRole,
          effect,
          userId: userId ?? existing.userId,
        },
      });
    }
  }

  // Optional precedence flip on the role rule for this application. We need the
  // user's primary role to know which rule to touch.
  let roleOverrideApplied: boolean | null = null;
  if (typeof overrideRole === "boolean") {
    const primaryRole = await primaryRoleOfUsername(cleanUsername);
    if (primaryRole) {
      const rule = await prisma.roleApplication.findUnique({
        where: {
          primaryRole_applicationId: { primaryRole, applicationId: application.id },
        },
        select: { id: true },
      });
      if (rule) {
        await prisma.roleApplication.update({
          where: { id: rule.id },
          data: { overrideUsers: overrideRole },
        });
        roleOverrideApplied = overrideRole;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    effect,
    role: targetRole,
    username: cleanUsername,
    clientId: application.clientId,
    roleOverrideApplied,
  });
}

/** The SSO primary role for a username (admin-key lookup, no session needed). */
async function primaryRoleOfUsername(username: string): Promise<string | null> {
  const base = process.env.SSO_BASE_URL;
  const key = process.env.SSO_ADMIN_KEY;
  if (!base || !key) return null;
  const res = await fetch(
    `${base}/api/admin/users?key=${encodeURIComponent(key)}&username=${encodeURIComponent(username)}`,
    { cache: "no-store" }
  ).catch(() => null);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    users?: { primaryRole?: string | null }[];
  };
  const role = data.users?.[0]?.primaryRole ?? null;
  forgetPrimaryRole(username);
  return role;
}
