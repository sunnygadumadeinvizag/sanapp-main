import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

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

  const apps = await prisma.application.findMany({
    where: {
      enabled: true,
      grants: { some: { OR: [{ userId: user.sub }, { username: user.username }] } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      clientId: true,
      name: true,
      description: true,
      url: true,
      category: true,
      openInNewTab: true,
    },
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

  const apps = await prisma.application.findMany({
    where: {
      enabled: true,
      grants: { some: { OR: [{ userId: userId ?? undefined }, { username }] } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      clientId: true,
      name: true,
      description: true,
      url: true,
      category: true,
      openInNewTab: true,
    },
  });

  return NextResponse.json({ apps });
}
