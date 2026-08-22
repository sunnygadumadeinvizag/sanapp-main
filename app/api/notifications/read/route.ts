import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { clientIdForBasePath } from "@/lib/appNotifications";

export const dynamic = "force-dynamic";

/**
 * POST — mark notifications read. Two callers:
 *  - Main's own UI (main_session cookie): marks the session user's rows.
 *  - An application proxy (x-app-key + username in body): marks that user's rows.
 * Body: { ids?: string[], all?: boolean, basePath?: string }
 * `basePath` scopes "mark all" to the pushing application (an app's
 * "App Notifications" page must not clear other apps' notifications).
 */
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((i: unknown) => typeof i === "string")
    : [];
  const all = body?.all === true;

  let username: string | null = null;
  let appClientId: string | null = null;

  const appKey = request.headers.get("x-app-key");
  if (appKey && appKey === process.env.MAIN_API_KEY) {
    username = typeof body?.username === "string" ? body.username : null;
    if (!username) return NextResponse.json({ error: "username_required" }, { status: 400 });
    if (body?.basePath) appClientId = await clientIdForBasePath(body.basePath);
  } else {
    const store = await cookies();
    const session = store.get("main_session")?.value ?? "";
    const me = await verifyMainSession(session);
    if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    username = me.username;
  }

  if (ids.length > 0) {
    await prisma.appNotification.updateMany({
      where: { username, id: { in: ids } },
      data: { read: true, readAt: new Date() },
    });
  } else if (all) {
    await prisma.appNotification.updateMany({
      where: { username, read: false, ...(appClientId ? { appClientId } : {}) },
      data: { read: true, readAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true });
}
