import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

/** Returns the current Main user only when they are a super admin. */
async function requireSuperAdmin() {
  const store = await cookies();
  const session = store.get("main_session")?.value;
  if (!session) return null;
  const me = await verifyMainSession(session);
  return me && me.role === "SUPER_ADMIN" ? me : null;
}

function adminHeaders() {
  return {
    "content-type": "application/json",
    "x-admin-key": SSO_ADMIN_KEY,
  };
}

/** GET — list all SSO users joined with their Main grant count. */
export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${SSO_BASE_URL}/api/admin/users`, {
    headers: adminHeaders(),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  const users: Array<Record<string, unknown>> = res.ok && Array.isArray(data.users) ? data.users : [];

  // Count the applications each user can actually open: their direct grants
  // plus the rules for their primary role (a direct grant is counted once).
  const grants = await prisma.userApplication.findMany();
  const roleRules = await prisma.roleApplication.findMany({
    select: { primaryRole: true, applicationId: true },
  });
  const directByUser = new Map<string, Set<string>>();
  for (const g of grants) {
    const key = g.username.toLowerCase();
    const set = directByUser.get(key) ?? new Set<string>();
    set.add(g.applicationId);
    directByUser.set(key, set);
  }
  const appsByRole = new Map<string, Set<string>>();
  for (const r of roleRules) {
    const set = appsByRole.get(r.primaryRole) ?? new Set<string>();
    set.add(r.applicationId);
    appsByRole.set(r.primaryRole, set);
  }

  return NextResponse.json({
    users: users.map((u) => {
      const effective = new Set(directByUser.get(String(u.username).toLowerCase()) ?? []);
      for (const appId of appsByRole.get(String(u.primaryRole ?? "")) ?? []) effective.add(appId);
      return { ...u, appCount: effective.size };
    }),
  });
}

/** POST — create a user identity in the SSO. */
export async function POST(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${SSO_BASE_URL}/api/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/** PATCH — update a user identity in the SSO. */
export async function PATCH(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${SSO_BASE_URL}/api/admin/users`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

/** DELETE — remove a user identity from the SSO and revoke their grants. */
export async function DELETE(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = request.nextUrl.searchParams.get("id") ?? (body as { id?: string }).id;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const res = await fetch(`${SSO_BASE_URL}/api/admin/users`, {
    method: "DELETE",
    headers: adminHeaders(),
    body: JSON.stringify({ id: String(id) }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));

  if (res.ok) {
    // Revoke every application grant for this user (by id and username).
    await prisma.userApplication.deleteMany({
      where: { OR: [{ userId: String(id) }, { username: String(data.deleted ?? "") }] },
    });
  }

  return NextResponse.json(data, { status: res.status });
}
