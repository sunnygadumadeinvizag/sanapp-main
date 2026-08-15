import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const LOGREQUEST_BASE_URL = process.env.LOGREQUEST_BASE_URL ?? "";
const INTERNAL_KEY = process.env.LOGREQUEST_INTERNAL_KEY ?? "";

type RouteCtx = { params: Promise<{ id: string }> };

async function requireUser() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  return verifyMainSession(session);
}

async function appByName(name: string | null) {
  if (!name) return null;
  return prisma.application.findFirst({
    where: { name, enabled: true },
    select: { id: true, name: true, url: true },
  });
}

async function toIssue(r: any) {
  const app = await appByName(r.appName);
  return {
    id: r.id,
    applicationId: app?.id ?? r.appName ?? "",
    application: app ?? { id: r.appName ?? "", name: r.appName ?? "Intranet", url: "" },
    username: r.requestedBy?.username ?? "",
    name: r.requestedBy?.name ?? "",
    title: r.title,
    description: r.description,
    status: mapStatusOut(r.status),
    priority: r.priority,
    resolution: r.resolution,
    resolvedAt: r.resolvedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function mapStatusOut(s: string): "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" {
  switch (s) {
    case "IN_PROGRESS":
    case "PENDING":
      return "IN_PROGRESS";
    case "RESOLVED":
      return "RESOLVED";
    case "CLOSED":
      return "CLOSED";
    default:
      return "OPEN";
  }
}

// GET /api/issues/[id] — owner or super admin (proxied to Log Request).
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const me = await requireUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const res = await fetch(`${LOGREQUEST_BASE_URL}/api/internal/issues/${id}`, {
    headers: { "x-internal-key": INTERNAL_KEY },
    cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const data = await res.json();

  const canView =
    me.role === "SUPER_ADMIN" ||
    data.issue.requestedBy?.username === me.username;
  if (!canView) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({ issue: await toIssue(data.issue) });
}

// PATCH /api/issues/[id] — super admin updates status / resolution.
// Proxied to the Log Request entry so both apps stay in sync.
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

  const payload: any = {};
  if (["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(body.status)) {
    payload.status = body.status;
  }
  if (typeof body.resolution === "string") {
    payload.resolution = body.resolution.trim() || null;
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const res = await fetch(`${LOGREQUEST_BASE_URL}/api/internal/issues/${id}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-internal-key": INTERNAL_KEY,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data?.error ?? "update_failed" }, { status: res.status >= 500 ? 502 : res.status });
  }

  return NextResponse.json({ issue: await toIssue(data.issue) });
}
