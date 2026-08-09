import { NextRequest, NextResponse } from "next/server";

function isLocalPath(p: string) {
  return p.startsWith("/") && !p.startsWith("//") && !p.includes("..");
}

export async function GET(request: NextRequest) {
  let returnTo = request.nextUrl.searchParams.get("returnTo") ?? "";
  if (!isLocalPath(returnTo)) {
    const ref = request.headers.get("referer") ?? "";
    try {
      const refUrl = new URL(ref);
      const p = refUrl.pathname + refUrl.search;
      if (isLocalPath(p)) returnTo = p;
    } catch {
      /* ignore */
    }
  }
  if (!isLocalPath(returnTo)) returnTo = "/";

  const target = new URL(process.env.MAIN_BASE_URL! + returnTo);
  const ssoLogout = new URL("/logout", process.env.SSO_BASE_URL!);
  ssoLogout.searchParams.set("post_logout_redirect_uri", target.toString());

  const res = NextResponse.redirect(ssoLogout, 303);
  res.cookies.set("main_session", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
