import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIdForBasePath, serializeNotification } from "@/lib/appNotifications";

export const dynamic = "force-dynamic";

/**
 * POST — internal (x-app-key): an application asks for one of its user's
 * notifications. Body:
 *   { username, scope: "all" | "app", basePath?, unreadOnly?, limit?, page? }
 * scope "app" + the caller's own basePath restricts the list to notifications
 * that app pushed (its "App Notifications" page); scope "all" powers the
 * header bell with every application's notifications.
 */
export async function POST(request: NextRequest) {
  const appKey = request.headers.get("x-app-key");
  if (appKey !== process.env.MAIN_API_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const username = typeof body?.username === "string" ? body.username : "";
  if (!username) return NextResponse.json({ error: "username_required" }, { status: 400 });

  const limit = Math.min(100, Math.max(1, Number(body.limit ?? 30)));
  const page = Math.max(1, Number(body.page ?? 1));
  const scope = body.scope === "app" ? "app" : "all";
  const appClientId =
    scope === "app" ? await clientIdForBasePath(body?.basePath) : null;

  const where = {
    username,
    ...(appClientId ? { appClientId } : {}),
    ...(body.unreadOnly ? { read: false } : {}),
  };
  const [rows, total, unread] = await Promise.all([
    prisma.appNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { application: { select: { name: true } } },
    }),
    prisma.appNotification.count({ where }),
    prisma.appNotification.count({
      where: { username, ...(appClientId ? { appClientId } : {}), read: false },
    }),
  ]);

  return NextResponse.json({
    notifications: rows.map(serializeNotification),
    unread,
    total,
    page,
    limit,
  });
}
