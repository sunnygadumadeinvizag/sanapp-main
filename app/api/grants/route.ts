import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

/**
 * POST { userId?, username, clientId, allowed }
 * Grants or revokes application access. Requires a valid Main session.
 */
export async function POST(request: NextRequest) {
  const store = await cookies();
  const session = store.get("main_session")?.value;
  if (!session || !(await verifyMainSession(session))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { userId, username, clientId, allowed } = body as {
    userId?: string;
    username: string;
    clientId: string;
    allowed: boolean;
  };

  if (!username || !clientId) {
    return NextResponse.json({ error: "username and clientId required" }, { status: 400 });
  }

  const application = await prisma.application.findUnique({ where: { clientId } });
  if (!application) {
    return NextResponse.json({ error: "application not found" }, { status: 404 });
  }

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
        },
      });
    }
  } else {
    await prisma.userApplication.deleteMany({
      where: { applicationId: application.id, username },
    });
  }

  return NextResponse.json({ ok: true, allowed, username, clientId });
}
