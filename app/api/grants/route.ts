import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

/**
 * POST { userId?, username, clientId, allowed, role? }
 * Grants or revokes application access, optionally assigning APP_ADMIN vs USER role.
 * Requires a SUPER_ADMIN Main session.
 */
export async function POST(request: NextRequest) {
  const store = await cookies();
  const session = store.get("main_session")?.value || request.cookies.get("main_session")?.value;
  if (!session) {
    return NextResponse.json({ error: "unauthorized: main_session cookie missing" }, { status: 401 });
  }
  const me = await verifyMainSession(session);
  if (!me || me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "forbidden: superadmin role required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { userId, username, clientId, allowed, role } = body as {
    userId?: string;
    username: string;
    clientId: string;
    allowed: boolean;
    role?: string;
  };

  if (!username || !clientId) {
    return NextResponse.json({ error: "username and clientId required" }, { status: 400 });
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanClientId = clientId.trim().toLowerCase();

  const apps = await prisma.application.findMany();
  const application = apps.find(
    (a) => a.clientId.toLowerCase() === cleanClientId || a.id.toLowerCase() === cleanClientId
  );

  if (!application) {
    return NextResponse.json({ error: "application not found" }, { status: 404 });
  }

  const targetRole = role === "APP_ADMIN" ? "APP_ADMIN" : "USER";

  if (allowed) {
    const existing = await prisma.userApplication.findFirst({
      where: {
        applicationId: application.id,
        username: { equals: cleanUsername, mode: "insensitive" },
      },
    });
    if (!existing) {
      await prisma.userApplication.create({
        data: {
          userId: userId ?? null,
          username: cleanUsername,
          applicationId: application.id,
          role: targetRole,
        },
      });
    } else {
      await prisma.userApplication.update({
        where: { id: existing.id },
        data: {
          role: targetRole,
          userId: userId ?? existing.userId,
        },
      });
    }
  } else {
    await prisma.userApplication.deleteMany({
      where: {
        applicationId: application.id,
        username: { equals: cleanUsername, mode: "insensitive" },
      },
    });
  }

  return NextResponse.json({ ok: true, allowed, role: targetRole, username: cleanUsername, clientId: application.clientId });
}
