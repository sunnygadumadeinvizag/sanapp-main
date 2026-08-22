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
  const session = store.get("main_session")?.value;
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const me = await verifyMainSession(session);
  if (!me || me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

  const application = await prisma.application.findUnique({ where: { clientId } });
  if (!application) {
    return NextResponse.json({ error: "application not found" }, { status: 404 });
  }

  const targetRole = role === "APP_ADMIN" ? "APP_ADMIN" : "USER";

  if (allowed) {
    const existing = await prisma.userApplication.findFirst({
      where: { applicationId: application.id, username },
    });
    if (!existing) {
      await prisma.userApplication.create({
        data: {
          userId: userId ?? null,
          username,
          applicationId: application.id,
          role: targetRole,
        },
      });
    } else if (existing.role !== targetRole) {
      await prisma.userApplication.update({
        where: { id: existing.id },
        data: { role: targetRole },
      });
    }
  } else {
    await prisma.userApplication.deleteMany({
      where: { applicationId: application.id, username },
    });
  }

  return NextResponse.json({ ok: true, allowed, role: targetRole, username, clientId });
}
