import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyMainSessionFull } from "@/lib/session";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const CLIENT_ID = process.env.MAIN_CLIENT_ID!;
const CLIENT_SECRET = process.env.MAIN_CLIENT_SECRET!;

export async function GET() {
  const store = await cookies();
  const token = store.get("main_session")?.value;
  const meta = token ? await verifyMainSessionFull(token) : null;
  if (!meta) {
    return NextResponse.json({ valid: false, reason: "no_app_session" });
  }

  // The browser forwards the central SSO cookie to us (same host) — ask the
  // SSO whether it is still valid. If the user signed out in another tab or
  // another application, this turns invalid and every tab signs out.
  const ssoSession = store.get("sso_session")?.value;
  if (!ssoSession) {
    return NextResponse.json({ valid: false, reason: "no_sso_session" });
  }

  try {
    const checkRes = await fetch(`${SSO_BASE_URL}/api/session/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        ssoSession,
      }),
      cache: "no-store",
    });
    const data = checkRes.ok ? await checkRes.json() : { valid: false };
    return NextResponse.json({
      valid: data.valid === true,
      reason: data.valid === true ? undefined : "sso_session_invalid",
    });
  } catch {
    // SSO unreachable — do not sign the user out over a transient network error.
    return NextResponse.json({ valid: true, reason: "sso_unreachable" });
  }
}
