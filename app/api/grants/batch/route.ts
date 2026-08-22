import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

/**
 * POST /api/grants/batch
 * Body options:
 * 1) { action: "grant" | "revoke", users: { userId?: string; username: string }[], clientIds: string[] }
 * 2) { action: "set_exact", users: { userId?: string; username: string }[], clientIds: string[] }
 * 3) { operations: { userId?: string; username: string; clientId: string; allowed: boolean }[] }
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
  const { action, users, clientIds, operations } = body as {
    action?: "grant" | "revoke" | "set_exact";
    users?: { userId?: string | null; username: string }[];
    clientIds?: string[];
    operations?: { userId?: string | null; username: string; clientId: string; allowed: boolean }[];
  };

  // Pre-fetch applications to map clientId -> applicationId
  const apps = await prisma.application.findMany();
  const appByClientId = new Map(apps.map((a) => [a.clientId, a.id]));

  if (Array.isArray(operations) && operations.length > 0) {
    const creates: { userId: string | null; username: string; applicationId: string }[] = [];
    const deleteConditions: { username: string; applicationId: string }[] = [];

    for (const op of operations) {
      const appId = appByClientId.get(op.clientId);
      if (!appId) continue;

      if (op.allowed) {
        creates.push({
          userId: op.userId ?? null,
          username: op.username,
          applicationId: appId,
        });
      } else {
        deleteConditions.push({
          username: op.username,
          applicationId: appId,
        });
      }
    }

    // Execute operations in a transaction
    await prisma.$transaction(async (tx) => {
      for (const d of deleteConditions) {
        await tx.userApplication.deleteMany({
          where: { username: d.username, applicationId: d.applicationId },
        });
      }
      for (const c of creates) {
        const existing = await tx.userApplication.findFirst({
          where: { username: c.username, applicationId: c.applicationId },
        });
        if (!existing) {
          await tx.userApplication.create({
            data: {
              userId: c.userId,
              username: c.username,
              applicationId: c.applicationId,
            },
          });
        }
      }
    });

    return NextResponse.json({ ok: true, processed: operations.length });
  }

  if (action && Array.isArray(users) && users.length > 0 && Array.isArray(clientIds)) {
    const targetAppIds: string[] = [];
    for (const cid of clientIds) {
      const appId = appByClientId.get(cid);
      if (appId) targetAppIds.push(appId);
    }

    if (targetAppIds.length === 0 && action !== "set_exact") {
      return NextResponse.json({ error: "No valid applications specified" }, { status: 400 });
    }

    const usernames = users.map((u) => u.username);

    await prisma.$transaction(async (tx) => {
      if (action === "grant") {
        for (const user of users) {
          for (const appId of targetAppIds) {
            const existing = await tx.userApplication.findFirst({
              where: { username: user.username, applicationId: appId },
            });
            if (!existing) {
              await tx.userApplication.create({
                data: {
                  userId: user.userId ?? null,
                  username: user.username,
                  applicationId: appId,
                },
              });
            }
          }
        }
      } else if (action === "revoke") {
        await tx.userApplication.deleteMany({
          where: {
            username: { in: usernames },
            applicationId: { in: targetAppIds },
          },
        });
      } else if (action === "set_exact") {
        // Remove all current apps for these users, then assign the target apps
        await tx.userApplication.deleteMany({
          where: {
            username: { in: usernames },
          },
        });
        for (const user of users) {
          for (const appId of targetAppIds) {
            await tx.userApplication.create({
              data: {
                userId: user.userId ?? null,
                username: user.username,
                applicationId: appId,
              },
            });
          }
        }
      }
    });

    return NextResponse.json({
      ok: true,
      action,
      usersAffected: users.length,
      appsAffected: targetAppIds.length,
    });
  }

  return NextResponse.json({ error: "Invalid batch request format" }, { status: 400 });
}
