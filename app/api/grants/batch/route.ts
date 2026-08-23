import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

/**
 * POST /api/grants/batch
 * Body options:
 * 1) { action: "grant" | "revoke" | "set_role", role?: "USER" | "APP_ADMIN", users: { userId?: string; username: string }[], clientIds: string[] }
 * 2) { action: "set_exact", role?: "USER" | "APP_ADMIN", users: { userId?: string; username: string }[], clientIds: string[] }
 * 3) { operations: { userId?: string; username: string; clientId: string; allowed: boolean; role?: string }[] }
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
  const { action, role, users, clientIds, operations } = body as {
    action?: "grant" | "revoke" | "set_exact" | "set_role";
    role?: "USER" | "APP_ADMIN";
    users?: { userId?: string | null; username: string }[];
    clientIds?: string[];
    operations?: { userId?: string | null; username: string; clientId: string; allowed: boolean; role?: string }[];
  };

  const apps = await prisma.application.findMany();
  const appByClientId = new Map<string, string>();
  for (const a of apps) {
    appByClientId.set(a.clientId.toLowerCase(), a.id);
    appByClientId.set(a.id.toLowerCase(), a.id);
  }
  const defaultRole = role === "APP_ADMIN" ? "APP_ADMIN" : "USER";

  if (Array.isArray(operations) && operations.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const op of operations) {
        const appId = appByClientId.get(op.clientId.toLowerCase());
        if (!appId) continue;
        const cleanUsername = op.username.trim().toLowerCase();

        if (op.allowed) {
          const opRole = op.role === "APP_ADMIN" ? "APP_ADMIN" : "USER";
          const existing = await tx.userApplication.findFirst({
            where: { username: { equals: cleanUsername, mode: "insensitive" }, applicationId: appId },
          });
          if (!existing) {
            await tx.userApplication.create({
              data: {
                userId: op.userId ?? null,
                username: cleanUsername,
                applicationId: appId,
                role: opRole,
              },
            });
          } else {
            await tx.userApplication.update({
              where: { id: existing.id },
              data: { role: opRole, userId: op.userId ?? existing.userId },
            });
          }
        } else {
          await tx.userApplication.deleteMany({
            where: { username: { equals: cleanUsername, mode: "insensitive" }, applicationId: appId },
          });
        }
      }
    });

    return NextResponse.json({ ok: true, processed: operations.length });
  }

  if (action && Array.isArray(users) && users.length > 0 && Array.isArray(clientIds)) {
    const targetAppIds: string[] = [];
    for (const cid of clientIds) {
      const appId = appByClientId.get(cid.toLowerCase());
      if (appId) targetAppIds.push(appId);
    }

    if (targetAppIds.length === 0 && action !== "set_exact") {
      return NextResponse.json({ error: "No valid applications specified" }, { status: 400 });
    }

    const usernames = users.map((u) => u.username.trim().toLowerCase());

    await prisma.$transaction(async (tx) => {
      if (action === "grant" || action === "set_role") {
        for (const user of users) {
          const cleanUsername = user.username.trim().toLowerCase();
          for (const appId of targetAppIds) {
            const existing = await tx.userApplication.findFirst({
              where: { username: { equals: cleanUsername, mode: "insensitive" }, applicationId: appId },
            });
            if (!existing) {
              await tx.userApplication.create({
                data: {
                  userId: user.userId ?? null,
                  username: cleanUsername,
                  applicationId: appId,
                  role: defaultRole,
                },
              });
            } else {
              await tx.userApplication.update({
                where: { id: existing.id },
                data: { role: defaultRole, userId: user.userId ?? existing.userId },
              });
            }
          }
        }
      } else if (action === "revoke") {
        await tx.userApplication.deleteMany({
          where: {
            username: { in: usernames, mode: "insensitive" },
            applicationId: { in: targetAppIds },
          },
        });
      } else if (action === "set_exact") {
        await tx.userApplication.deleteMany({
          where: {
            username: { in: usernames, mode: "insensitive" },
          },
        });
        for (const user of users) {
          const cleanUsername = user.username.trim().toLowerCase();
          for (const appId of targetAppIds) {
            await tx.userApplication.create({
              data: {
                userId: user.userId ?? null,
                username: cleanUsername,
                applicationId: appId,
                role: defaultRole,
              },
            });
          }
        }
      }
    });

    return NextResponse.json({
      ok: true,
      action,
      role: defaultRole,
      usersAffected: users.length,
      appsAffected: targetAppIds.length,
    });
  }

  return NextResponse.json({ error: "Invalid batch request format" }, { status: 400 });
}
