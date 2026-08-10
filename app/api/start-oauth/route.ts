import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await cookies();
  const state = crypto.randomUUID().replaceAll("-", "");
  const authorizeUrl = new URL(process.env.SSO_BASE_URL! + "/authorize");
  authorizeUrl.searchParams.set("client_id", process.env.MAIN_CLIENT_ID!);
  authorizeUrl.searchParams.set("redirect_uri", `${process.env.MAIN_BASE_URL}/auth/callback`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);
  store.set("main_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 300 });
  store.set("main_return_to", "/", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(authorizeUrl);
}
