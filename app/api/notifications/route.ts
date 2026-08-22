import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { clientIdForBasePath, serializeNotification } from "@/lib/appNotifications";

export const dynamic = "force-dynamic";

// The notification list shape shared by every endpoint.
async function listFor(
  username: string,
  opts: { appClientId?: string | null; unreadOnly?: boolean; limit?: number; page?: number }
) {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
  const page = Math.max(1, opts.page ?? 1);
  const where = {
    username,
    ...(opts.appClientId ? { appClientId: opts.appClientId } : {}),
    ...(opts.unreadOnly ? { read: false } : {}),
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
    prisma.appNotification.count({ where: { username, ...(opts.appClientId ? { appClientId: opts.appClientId } : {}), read: false } }),
  ]);
  return {
    notifications: rows.map(serializeNotification),
    unread,
    total,
    page,
    limit,
  };
}

/**
 * GET — the signed-in Main user's notifications (session-authenticated).
 * `?app=me` scopes to Main's own pushed notifications; default returns all
 * applications, which powers Main's header bell.
 */
export async function GET(request: NextRequest) {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  let appClientId: string | null = null;
  if (sp.get("app") === "me") {
    appClientId = await clientIdForBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
  }

  return NextResponse.json(
    await listFor(me.username, {
      appClientId,
      unreadOnly: sp.get("unread") === "1",
      limit: Number(sp.get("limit") ?? "30"),
      page: Number(sp.get("page") ?? "1"),
    })
  );
}

/**
 * POST — internal: an application pushes notifications for its users.
 * Header `x-app-key` must match MAIN_API_KEY. Body:
 *   { basePath: "/logrequest", items: [{ username, title, body?, href? }, ...] }
 * or a single { username, title, body?, href? }. The app is resolved from its
 * base path via the central registry, so notifications are always categorized
 * by the application that pushed them.
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

  const items: any[] = Array.isArray(body?.items) ? body.items : body ? [body] : [];
  const rows = items
    .filter((i) => i && typeof i.username === "string" && i.username && typeof i.title === "string" && i.title)
    .map((i) => ({
      username: String(i.username),
      title: String(i.title).slice(0, 200),
      body: i.body ? String(i.body).slice(0, 1000) : null,
      href: i.href ? String(i.href) : null,
    }));
  if (rows.length === 0) {
    return NextResponse.json({ error: "no_valid_items" }, { status: 400 });
  }

  const appClientId =
    typeof body?.appClientId === "string" && body.appClientId
      ? body.appClientId
      : await clientIdForBasePath(body?.basePath);
  if (!appClientId) {
    return NextResponse.json({ error: "unknown_application" }, { status: 400 });
  }
  const app = await prisma.application.findUnique({ where: { clientId: appClientId } });
  if (!app) {
    return NextResponse.json({ error: "unknown_application" }, { status: 400 });
  }

  await prisma.appNotification.createMany({
    data: rows.map((r) => ({ ...r, appClientId })),
  });
  return NextResponse.json({ ok: true, created: rows.length });
}
