import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

async function requireUser() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  return verifyMainSession(session);
}

// GET /api/issues/[id] — owner or super admin.
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const me = await requireUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const issue = await prisma.technicalIssue.findUnique({
    where: { id },
    include: { application: { select: { id: true, name: true, url: true } } },
  });
  if (!issue) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const canView =
    me.role === "SUPER_ADMIN" ||
    issue.userId === me.sub ||
    issue.username === me.username;
  if (!canView) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({
    issue: {
      id: issue.id,
      applicationId: issue.applicationId,
      application: issue.application,
      username: issue.username,
      name: issue.name,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      resolution: issue.resolution,
      resolvedAt: issue.resolvedAt ? issue.resolvedAt.toISOString() : null,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
    },
  });
}

// PATCH /api/issues/[id] — super admin updates status / resolution.
export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const me = await requireUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const issue = await prisma.technicalIssue.findUnique({ where: { id } });
  if (!issue) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: any = {};
  if (["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(body.status)) {
    data.status = body.status;
  }
  if (typeof body.resolution === "string") {
    data.resolution = body.resolution.trim() || null;
  }
  if (body.status === "RESOLVED" || body.status === "CLOSED") {
    data.resolvedAt = new Date();
  }
  if (body.status === "OPEN" || body.status === "IN_PROGRESS") {
    data.resolvedAt = null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const updated = await prisma.technicalIssue.update({
    where: { id },
    data,
    include: { application: { select: { id: true, name: true, url: true } } },
  });

  return NextResponse.json({
    issue: {
      id: updated.id,
      applicationId: updated.applicationId,
      application: updated.application,
      username: updated.username,
      name: updated.name,
      title: updated.title,
      description: updated.description,
      status: updated.status,
      priority: updated.priority,
      resolution: updated.resolution,
      resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
