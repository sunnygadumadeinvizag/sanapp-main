import { NextRequest, NextResponse } from "next/server";
import { verifyMainSession } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Strip the basePath (/sso, /main, /app1...) before matching routes so the
  // proxy works identically when the app is served behind Apache with a prefix.
  const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || "/main";
  const p =
    BASE_PATH && (pathname === BASE_PATH || pathname.startsWith(BASE_PATH + "/"))
      ? pathname.slice(BASE_PATH.length) || "/"
      : pathname;

  const isPublic =
    p === "/auth/callback" ||
    p === "/api" ||
    p.startsWith("/api/") ||
    p.startsWith("/_next") ||
    p.startsWith("/favicon") ||
    p.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/);

  if (isPublic) {
    return NextResponse.next();
  }

  const session = request.cookies.get("main_session")?.value;
  // Verified here (not just presence) so expired sessions bounce to the SSO
  // instead of rendering a broken page.
  const valid = session ? await verifyMainSession(session) : null;
  if (!valid) {
    const state = crypto.randomUUID().replaceAll("-", "");
    const authorizeUrl = new URL(process.env.SSO_BASE_URL + "/authorize");
    authorizeUrl.searchParams.set("client_id", process.env.MAIN_CLIENT_ID!);
    authorizeUrl.searchParams.set("redirect_uri", `${process.env.MAIN_BASE_URL}/auth/callback`);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", state);

    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set("main_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 300,
    });
    // Remember where the user was so the callback can send them back.
    res.cookies.set("main_return_to", pathname + search, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
