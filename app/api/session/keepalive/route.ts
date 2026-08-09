import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_CONFIG, createMainSession, verifyMainSessionFull } from "@/lib/session";

const RENEW_BEFORE_SECONDS = 5 * 60;

export async function POST() {
  const store = await cookies();
  const token = store.get("main_session")?.value;
  const meta = token ? await verifyMainSessionFull(token) : null;

  if (!meta) {
    return NextResponse.json({ valid: false, error: "no_session" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now - meta.iat > SESSION_CONFIG.maxSessionSeconds) {
    // Absolute maximum session length reached — force re-authentication.
    const res = NextResponse.json(
      { valid: false, error: "max_session_reached" },
      { status: 401 }
    );
    res.cookies.set("main_session", "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  }

  if (meta.exp - now < RENEW_BEFORE_SECONDS) {
    const session = await createMainSession(meta.user);
    const res = NextResponse.json({ valid: true, renewed: true });
    res.cookies.set("main_session", session, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  }

  return NextResponse.json({ valid: true, renewed: false });
}
