import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
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

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${SSO_BASE_URL}/api/admin/announcements`, {
    headers: adminHeaders(),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${SSO_BASE_URL}/api/admin/announcements`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${SSO_BASE_URL}/api/admin/announcements`, {
    method: "PATCH",
    headers: adminHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = request.nextUrl.searchParams.get("id") ?? (body as { id?: string }).id;
  const res = await fetch(`${SSO_BASE_URL}/api/admin/announcements`, {
    method: "DELETE",
    headers: adminHeaders(),
    body: JSON.stringify({ id: String(id) }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
