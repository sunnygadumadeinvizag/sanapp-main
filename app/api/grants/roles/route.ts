import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

/**
 * Role rules — "everyone whose primary role is X may open app Y".
 *
 * GET    — every rule, with the application it points at.
 * POST   { primaryRole, clientIds: string[], role?: "USER" | "APP_ADMIN" }
 *        — add or update the rules for one role (one request per role).
 * DELETE { primaryRole, clientIds: string[] } — remove the rules for a role.
 *
 * Super admin only. Rules take effect for the next access check, so a user
 * added to the role afterwards inherits the apps with no per-user grant.
 */

const PRIMARY_ROLES = [
  "STAFF_TEACHING",
  "STAFF_NON_TEACHING",
  "STUDENT",
  "SCHOLAR",
  "GUEST",
] as const;

async function requireSuperAdmin() {
  const store = await cookies();
  const session = store.get("main_session")?.value;
  if (!session) return null;
  const me = await verifyMainSession(session);
  return me && me.role === "SUPER_ADMIN" ? me : null;
}

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await prisma.roleApplication.findMany({
    include: { application: { select: { clientId: true, name: true } } },
    orderBy: [{ primaryRole: "asc" }, { application: { name: "asc" } }],
  });

  return NextResponse.json({
    rules: rows.map((r) => ({
      primaryRole: r.primaryRole,
      clientId: r.application.clientId,
      appName: r.application.name,
      role: r.role,
    })),
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    primaryRole?: string;
    clientIds?: string[];
    role?: string;
  };

  const primaryRole = String(body.primaryRole ?? "").trim();
  if (!(PRIMARY_ROLES as readonly string[]).includes(primaryRole)) {
    return NextResponse.json({ error: "unknown primaryRole" }, { status: 400 });
  }
  const clientIds = [...new Set((body.clientIds ?? []).map((c) => String(c).trim()).filter(Boolean))];
  if (clientIds.length === 0) {
    return NextResponse.json({ error: "clientIds is required" }, { status: 400 });
  }
  const role = body.role === "APP_ADMIN" ? "APP_ADMIN" : "USER";

  const apps = await prisma.application.findMany({ select: { id: true, clientId: true } });
  const idByClientId = new Map(apps.map((a) => [a.clientId.toLowerCase(), a.id]));
  const applicationIds: string[] = [];
  for (const cid of clientIds) {
    const id = idByClientId.get(cid.toLowerCase());
    if (id) applicationIds.push(id);
  }
  if (applicationIds.length === 0) {
    return NextResponse.json({ error: "No valid applications specified" }, { status: 400 });
  }

  await prisma.$transaction(
    applicationIds.map((applicationId) =>
      prisma.roleApplication.upsert({
        where: { primaryRole_applicationId: { primaryRole, applicationId } },
        create: { primaryRole, applicationId, role },
        update: { role },
      })
    )
  );

  return NextResponse.json({ ok: true, primaryRole, role, appsAffected: applicationIds.length });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    primaryRole?: string;
    clientIds?: string[];
  };

  const primaryRole = String(body.primaryRole ?? "").trim();
  if (!primaryRole) {
    return NextResponse.json({ error: "primaryRole is required" }, { status: 400 });
  }
  const clientIds = (body.clientIds ?? []).map((c) => String(c).trim()).filter(Boolean);

  const apps = await prisma.application.findMany({ select: { id: true, clientId: true } });
  const idByClientId = new Map(apps.map((a) => [a.clientId.toLowerCase(), a.id]));
  const applicationIds = clientIds
    .map((cid) => idByClientId.get(cid.toLowerCase()))
    .filter((id): id is string => Boolean(id));

  const deleted = await prisma.roleApplication.deleteMany({
    where: {
      primaryRole,
      ...(applicationIds.length > 0 ? { applicationId: { in: applicationIds } } : {}),
    },
  });

  return NextResponse.json({ ok: true, deleted: deleted.count });
}
