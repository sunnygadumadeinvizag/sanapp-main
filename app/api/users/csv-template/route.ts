import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyMainSession } from "@/lib/session";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

async function requireSuperAdmin() {
  const store = await cookies();
  const session = store.get("main_session")?.value;
  if (!session) return null;
  const me = await verifyMainSession(session);
  return me && me.role === "SUPER_ADMIN" ? me : null;
}

export async function GET(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${SSO_BASE_URL}/api/admin/users/csv-template`, {
    headers: { "x-admin-key": SSO_ADMIN_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ error: "template unavailable" }, { status: res.status });
  }
  const text = await res.text();
  return new NextResponse(text, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="iipe-users-template.csv"',
    },
  });
}
