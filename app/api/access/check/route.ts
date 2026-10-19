import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { effectiveAccess } from "@/lib/access";

/**
 * Called by independent applications (server-to-server) to answer:
 * "Is this user allowed to access this application, and what is their app role (USER vs APP_ADMIN)?"
 *
 * Access is a direct grant OR a rule for the user's primary role, so a user
 * added to a role that has been allocated an app is allowed immediately.
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

  const access = await effectiveAccess({
    applicationId: application.id,
    userId,
    username,
  });

  return NextResponse.json({
    allowed: access.allowed,
    role: access.role,
    source: access.source,
    effect: access.effect,
    overrodeUser: access.overrodeUser,
    application: { name: application.name },
  });
}
