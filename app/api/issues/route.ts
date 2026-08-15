import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The signed-in portal user, or null. Required for every endpoint here.
 */
async function requireUser() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  return me;
}

// GET /api/issues?scope=mine|all&status=&appId=&q=&page=&limit=
// Users see their own raised issues; super admins can list everything.
export async function GET(request: NextRequest) {
  const me = await requireUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const scope = sp.get("scope") ?? "mine";
  const status = sp.get("status") ?? "";
  const appId = sp.get("appId") ?? "";
  const q = (sp.get("q") ?? "").trim();
  const page = Math.max(1, Number(sp.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(5, Number(sp.get("limit") ?? "10")));

  if (scope === "all" && me.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const where: any = {};
  if (scope === "mine") {
    where.OR = [{ userId: me.sub }, { username: me.username }];
  }
  if (status) where.status = status;
  if (appId) where.applicationId = appId;
  if (q) {
    where.OR = [
      ...(where.OR ?? []),
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { username: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.technicalIssue.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: { application: { select: { id: true, name: true, url: true } } },
    }),
    prisma.technicalIssue.count({ where }),
  ]);

  return NextResponse.json({
    issues: rows.map((i) => ({
      id: i.id,
      applicationId: i.applicationId,
      application: i.application,
      username: i.username,
      name: i.name,
      title: i.title,
      description: i.description,
      status: i.status,
      priority: i.priority,
      resolution: i.resolution,
      resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    })),
    total,
    page,
    limit,
  });
}

// POST /api/issues — any signed-in portal user raises an issue against an app.
export async function POST(request: NextRequest) {
  const me = await requireUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const applicationId = String(body.applicationId ?? "");
  const priority = ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(body.priority)
    ? body.priority
    : "MEDIUM";

  if (!title || !description || !applicationId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app) return NextResponse.json({ error: "app_not_found" }, { status: 404 });

  const issue = await prisma.technicalIssue.create({
    data: {
      applicationId,
      userId: me.sub,
      username: me.username,
      name: me.name,
      title,
      description,
      priority,
    },
    include: { application: { select: { id: true, name: true, url: true } } },
  });

  return NextResponse.json(
    {
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
    },
    { status: 201 }
  );
}
