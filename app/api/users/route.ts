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

  // Count application grants per username from main_db.
  const grants = await prisma.userApplication.findMany();
  const countByUser = new Map<string, number>();
  for (const g of grants) {
    countByUser.set(g.username, (countByUser.get(g.username) ?? 0) + 1);
  }

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      appCount: countByUser.get(String(u.username)) ?? 0,
    })),
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
