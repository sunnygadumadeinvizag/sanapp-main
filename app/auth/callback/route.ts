import { NextRequest, NextResponse } from "next/server";
import { createMainSession } from "@/lib/session";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;
const CLIENT_ID = process.env.MAIN_CLIENT_ID!;
const CLIENT_SECRET = process.env.MAIN_CLIENT_SECRET!;

export async function GET(request: NextRequest) {
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const proto = request.headers.get("x-forwarded-proto") ?? "http";
const host = request.headers.get("host") ?? request.nextUrl.host;
const publicOrigin = `${proto}://${host}`;
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const storedState = request.cookies.get("main_oauth_state")?.value;
  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(new URL(BASE_PATH + "/?error=state_mismatch", publicOrigin));
  }

  // 1. Exchange the authorization code for tokens at the SSO token endpoint.
  const tokenRes = await fetch(`${SSO_BASE_URL}/api/oidc/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${MAIN_BASE_URL}/auth/callback`,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL(BASE_PATH + "/?error=token_failed", publicOrigin));
  }
  const tokens = await tokenRes.json();

  // 2. Ask the SSO who the user is.
  const userRes = await fetch(`${SSO_BASE_URL}/api/oidc/userinfo`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) {
    return NextResponse.redirect(new URL(BASE_PATH + "/?error=userinfo_failed", publicOrigin));
  }
  const user = await userRes.json();

  // 3. Create Main's own session and return the user to the page they were on.
  const session = await createMainSession({
    sub: user.sub,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role ?? "USER",
  });

  const returnTo = request.cookies.get("main_return_to")?.value ?? "/";
  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

  const res = NextResponse.redirect(new URL(safeReturn.startsWith(BASE_PATH) ? safeReturn : BASE_PATH + safeReturn, publicOrigin));
  res.cookies.delete("main_return_to");
  res.cookies.set("main_session", session, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
    secure: process.env.COOKIE_SECURE === "true",
  });
  res.cookies.delete("main_oauth_state");
  return res;
}
