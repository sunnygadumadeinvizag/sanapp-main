import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const LOGREQUEST_BASE_URL = process.env.LOGREQUEST_BASE_URL ?? "";
const INTERNAL_KEY = process.env.LOGREQUEST_INTERNAL_KEY ?? "";

/**
 * The signed-in portal user, or null. Required for every endpoint here.
 */
async function requireUser() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  return me;
}

/**
 * Resolve an application name (stored on the Log Request entry) back to the
 * registry application so the UI can show the app link.
 */
async function appByName(name: string | null) {
  if (!name) return null;
  return prisma.application.findFirst({
    where: { name, enabled: true },
    select: { id: true, name: true, url: true },
  });
}

/**
 * Map a Log Request serialized request into the issue shape the UI expects.
 */
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

/** Log Request status → Main issue status. */
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

// GET /api/issues?scope=mine|all&status=&appId=&q=&page=&limit=
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

  // Resolve appId → app name so the Log Request side can filter by it.
  let appName = "";
  if (appId) {
    const app = await prisma.application.findUnique({ where: { id: appId } });
    appName = app?.name ?? "";
  }

  const params = new URLSearchParams({
    scope,
    page: String(page),
    limit: String(limit),
  });
  if (scope === "mine") params.set("username", me.username);
  if (status) params.set("status", status);
  if (appName) params.set("appName", appName);
  if (q) params.set("q", q);

  const res = await fetch(`${LOGREQUEST_BASE_URL}/api/internal/issues?${params}`, {
    headers: { "x-internal-key": INTERNAL_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ error: "issues_unavailable", detail: res.status }, { status: 502 });
  }
  const data = await res.json();
  const issues = await Promise.all((data.requests ?? []).map(toIssue));
  return NextResponse.json({ issues, total: data.total ?? 0, page, limit });
}

// POST /api/issues — raise a technical issue against an application.
// The issue becomes a Log Request under the "Intranet Issue" category, so the
// category's POC works on it with the full request workflow.
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

  const res = await fetch(`${LOGREQUEST_BASE_URL}/api/internal/issues`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-key": INTERNAL_KEY,
    },
    body: JSON.stringify({
      username: me.username,
      name: me.name,
      appName: app.name,
      title,
      description,
      priority,
    }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data?.error ?? "issues_unavailable" }, { status: res.status >= 500 ? 502 : res.status });
  }

  const issue = await toIssue(data.request);
  return NextResponse.json({ issue }, { status: 201 });
}
