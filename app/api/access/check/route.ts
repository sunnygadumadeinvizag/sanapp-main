import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Called by independent applications (server-to-server) to answer:
 * "Is this user allowed to access this application, and what is their app role (USER vs APP_ADMIN)?"
 *
 * Body: { userId, username, clientId }
 * Header: x-app-key (shared key, must match MAIN_API_KEY)
 */
export async function POST(request: NextRequest) {
  const appKey = request.headers.get("x-app-key");
  if (appKey !== process.env.MAIN_API_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { userId, username, clientId } = body as {
    userId?: string;
    username?: string;
    clientId?: string;
  };

  if (!clientId || !username) {
    return NextResponse.json(
      { error: "clientId and username are required" },
      { status: 400 }
    );
  }

  const application = await prisma.application.findUnique({
    where: { clientId },
  });
  if (!application || !application.enabled) {
    return NextResponse.json({ allowed: false, role: "USER" }, { status: 200 });
  }

  const grant = await prisma.userApplication.findFirst({
    where: {
      applicationId: application.id,
      OR: [{ userId: userId ?? undefined }, { username }],
    },
  });

  return NextResponse.json({
    allowed: grant !== null,
    role: grant?.role ?? "USER",
    application: { name: application.name },
  });
}
