import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

/** Returns the current Main user only when they are a super admin. */
async function requireSuperAdmin() {
  const store = await cookies();
  const session = store.get("main_session")?.value;
  if (!session) return null;
  const me = await verifyMainSession(session);
  return me && me.role === "SUPER_ADMIN" ? me : null;
}

/** Registered OIDC clients in the SSO (clientId must exist there first). */
async function ssoClientIds(): Promise<Set<string>> {
  try {
    const res = await fetch(`${SSO_BASE_URL}/api/admin/clients`, {
      headers: { "x-admin-key": SSO_ADMIN_KEY },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    const clients: Array<{ clientId: string }> =
      res.ok && Array.isArray(data.clients) ? data.clients : [];
    return new Set(clients.map((c) => c.clientId));
  } catch {
    return new Set();
  }
}

type AppInput = {
  clientId?: string;
  name?: string;
  description?: string | null;
  url?: string;
  category?: string;
  enabled?: boolean;
  openInNewTab?: boolean;
};

function normalize(body: Record<string, unknown>): AppInput {
  return {
    clientId: typeof body.clientId === "string" ? body.clientId.trim() : undefined,
    name: typeof body.name === "string" ? body.name.trim() : undefined,
    description:
      typeof body.description === "string" ? body.description.trim() || null : undefined,
    url: typeof body.url === "string" ? body.url.trim() : undefined,
    category:
      typeof body.category === "string" && body.category.trim().length > 0
        ? body.category.trim()
        : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    openInNewTab: typeof body.openInNewTab === "boolean" ? body.openInNewTab : undefined,
  };
}

function isValidUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

/** GET — list applications with grant counts. */
export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apps = await prisma.application.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { grants: true } } },
  });
  return NextResponse.json({ applications: apps });
}

/** POST — register a new application. */
export async function POST(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = normalize(await request.json().catch(() => ({})));
  if (!body.clientId || !body.name || !body.url) {
    return NextResponse.json(
      { error: "clientId, name and url are required" },
      { status: 400 }
    );
  }
  if (!isValidUrl(body.url)) {
    return NextResponse.json(
      { error: "url must start with http:// or https://" },
      { status: 400 }
    );
  }

  const exists = await prisma.application.findUnique({
    where: { clientId: body.clientId },
  });
  if (exists) {
    return NextResponse.json(
      { error: "An application with that OIDC client id already exists" },
      { status: 409 }
    );
  }

  // The OIDC client must already be registered in the SSO.
  const clientIds = await ssoClientIds();
  if (clientIds.size > 0 && !clientIds.has(body.clientId)) {
    return NextResponse.json(
      {
        error: `OIDC client "${body.clientId}" is not registered in the SSO. Register it in sanapp-sso first (seed or the OidcClient table).`,
      },
      { status: 400 }
    );
  }

  const application = await prisma.application.create({
    data: {
      clientId: body.clientId,
      name: body.name,
      description: body.description ?? null,
      url: body.url,
      category: body.category ?? "General",
      enabled: body.enabled ?? true,
      openInNewTab: body.openInNewTab ?? true,
    },
  });

  return NextResponse.json({ application }, { status: 201 });
}

/** PATCH — update an application. */
export async function PATCH(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existing = await prisma.application.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "application not found" }, { status: 404 });
  }

  const body = normalize(raw);
  if (body.url && !isValidUrl(body.url)) {
    return NextResponse.json(
      { error: "url must start with http:// or https://" },
      { status: 400 }
    );
  }
  if (body.clientId && body.clientId !== existing.clientId) {
    const clash = await prisma.application.findUnique({
      where: { clientId: body.clientId },
    });
    if (clash) {
      return NextResponse.json(
        { error: "An application with that OIDC client id already exists" },
        { status: 409 }
      );
    }
    const clientIds = await ssoClientIds();
    if (clientIds.size > 0 && !clientIds.has(body.clientId)) {
      return NextResponse.json(
        {
          error: `OIDC client "${body.clientId}" is not registered in the SSO. Register it in sanapp-sso first.`,
        },
        { status: 400 }
      );
    }
  }

  const application = await prisma.application.update({
    where: { id },
    data: {
      ...(body.clientId ? { clientId: body.clientId } : {}),
      ...(body.name ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.url ? { url: body.url } : {}),
      ...(body.category ? { category: body.category } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.openInNewTab !== undefined ? { openInNewTab: body.openInNewTab } : {}),
    },
  });

  return NextResponse.json({ application });
}

/** DELETE — remove an application and its grants (cascade). */
export async function DELETE(request: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = request.nextUrl.searchParams.get("id") ?? (body as { id?: string }).id;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existing = await prisma.application.findUnique({ where: { id: String(id) } });
  if (!existing) {
    return NextResponse.json({ error: "application not found" }, { status: 404 });
  }

  await prisma.application.delete({ where: { id: String(id) } });
  return NextResponse.json({ ok: true, deleted: existing.clientId });
}
