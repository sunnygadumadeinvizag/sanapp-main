import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyMainSession } from "@/lib/session";
import { accessibleApplications } from "@/lib/access";

/**
 * GET — the signed-in portal user's own applications.
 * Powers the shared AppsMenu (Apps launcher icon) in this app's header.
 */
export async function GET() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const user = await verifyMainSession(session);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apps = await accessibleApplications({
    userId: user.sub,
    username: user.username,
  });

  return NextResponse.json({ apps });
}

/**
 * POST { userId, username }  + header x-app-key
 * Returns the enabled applications the user is allowed to open.
 * Called by the independent applications (and used to build the launcher).
 */
export async function POST(request: NextRequest) {
  const appKey = request.headers.get("x-app-key");
  if (appKey !== process.env.MAIN_API_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { userId, username } = body as { userId?: string; username?: string };
  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  const apps = await accessibleApplications({ userId, username });

  return NextResponse.json({ apps });
}
