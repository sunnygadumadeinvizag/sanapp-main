import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Server-to-server lookup used by independent applications (consumers of
 * sanapp-common-ui) to answer "which app am I?".
 *
 * One project can host several applications: the same Next.js codebase may be
 * deployed at two different base paths, each registered here as its own
 * application. A deployment calls this with its own base path and gets back the
 * registry name to show in the header badge and the sidebar.
 *
 * Auth: x-app-key header must match MAIN_API_KEY.
 * Query: ?path=/logrequest  (base path, leading slash, trailing slash optional)
 */
export async function GET(request: NextRequest) {
  const appKey = request.headers.get("x-app-key");
  if (appKey !== process.env.MAIN_API_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const path = (request.nextUrl.searchParams.get("path") ?? "").trim();
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const norm = (p: string) => (p || "").replace(/\/+$/, "") || "/";

  const applications = await prisma.application.findMany({
    where: { enabled: true },
    select: { id: true, name: true, description: true, url: true, category: true },
  });

  const matched = applications.find((a) => {
    try {
      return norm(new URL(a.url).pathname) === norm(path);
    } catch {
      return false;
    }
  });

  if (!matched) {
    return NextResponse.json({ name: null });
  }

  return NextResponse.json({
    name: matched.name,
    description: matched.description,
    category: matched.category,
  });
}
