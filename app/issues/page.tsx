import { cookies } from "next/headers";
import { apiPath, Breadcrumb, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { userNavItems } from "../components/adminNav";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { IssuesClient } from "../components/IssuesClient";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;
const LOGREQUEST_BASE_URL = process.env.LOGREQUEST_BASE_URL ?? "";
const INTERNAL_KEY = process.env.LOGREQUEST_INTERNAL_KEY ?? "";

export default async function IssuesPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  const apps = await prisma.application.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, url: true },
  });

  // Issues live in Log Request (Intranet Issue category) — single source of truth.
  let issues: any[] = [];
  let total = 0;
  if (me) {
    const params = new URLSearchParams({ scope: "mine", username: me.username, page: "1", limit: "10" });
    const res = await fetch(`${LOGREQUEST_BASE_URL}/api/internal/issues?${params}`, {
      headers: { "x-internal-key": INTERNAL_KEY },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      issues = data.requests ?? [];
      total = data.total ?? 0;
    }
  }

  const navItems = getPlatformNav({
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
  });
  const sidebarItems = userNavItems("issues", SSO_BASE_URL);

  return (
    <PageShell
      appName="Main"
      header={{
        navItems,
        appsLauncherHref: `${MAIN_BASE_URL}/my-apps`,
        right: me ? (
          <UserMenu name={me.name} email={me.email} role={isSuperAdmin ? "Super Admin" : "User"} signOutHref="/api/logout">
            <a href={`${SSO_BASE_URL}/account`}>My Account</a>
            <a href={`${MAIN_BASE_URL}/my-apps`}>My Apps</a>
            {isSuperAdmin && (
              <>
                <div className="iipe-dropdown-section">Admin Console</div>
                <a href={apiPath("/admin-console")}>Admin Console</a>
              </>
            )}
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={sidebarItems}
    >
      <SessionGuard channel="sanapp-main-session" />
      <Breadcrumb items={[{ label: "Technical Issues" }]} />
      <h1 className="iipe-page-title">Technical Issues</h1>
      <p className="iipe-page-sub">
        Something not working in an application? Raise a technical issue against any app on the
        intranet — it is handled by the Intranet Issue team (POC) in Log Request.
      </p>

      <div className="mt-4">
        <IssuesClient
          apps={apps}
          initialIssues={issues.map((i: any) => ({
            id: i.id,
            applicationId: i.appName ?? "",
            application: { id: i.appName ?? "", name: i.appName ?? "Intranet", url: "" },
            username: i.requestedBy?.username ?? "",
            name: i.requestedBy?.name ?? "",
            title: i.title,
            description: i.description,
            status: i.status === "IN_PROGRESS" || i.status === "PENDING" ? "IN_PROGRESS" : i.status === "RESOLVED" ? "RESOLVED" : i.status === "CLOSED" ? "CLOSED" : "OPEN",
            priority: i.priority,
            resolution: i.resolution,
            resolvedAt: i.resolvedAt,
            createdAt: i.createdAt,
          }))}
          initialTotal={total}
          scope="mine"
          isSuperAdmin={!!isSuperAdmin}
        />
      </div>
    </PageShell>
  );
}
