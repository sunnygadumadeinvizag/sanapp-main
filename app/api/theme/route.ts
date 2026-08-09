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

export async function GET() {
  // Public — the theme toggle reads the platform defaults from here.
  const res = await fetch(`${SSO_BASE_URL}/api/theme`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const res = await fetch(`${SSO_BASE_URL}/api/admin/theme`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-admin-key": SSO_ADMIN_KEY,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
