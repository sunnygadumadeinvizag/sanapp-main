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

export async function POST(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Please choose a CSV file" }, { status: 400 });
  }

  // Forward the same multipart body to the SSO import endpoint.
  const forward = new FormData();
  forward.append("file", file, file.name);
  const res = await fetch(`${SSO_BASE_URL}/api/admin/users/import`, {
    method: "POST",
    headers: { "x-admin-key": SSO_ADMIN_KEY },
    body: forward,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
