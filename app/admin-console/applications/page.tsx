import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { apiPath, Breadcrumb, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { adminCrumb, adminNavItems } from "../../components/adminNav";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { ApplicationsManager, type ManagedApp, type SsoClient } from "../../components/ApplicationsManager";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

export default async function AdminApplicationsPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  if (!me) {
    redirect(process.env.MAIN_BASE_URL! + "/api/start-oauth");
  }
  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  if (!isSuperAdmin) redirect("/");

  const applications = await prisma.application.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { grants: true } } },
  });

  // Registered OIDC clients from the SSO (used when adding/editing an app).
  const clientsRes = await fetch(`${SSO_BASE_URL}/api/admin/clients`, {
    headers: { "x-admin-key": SSO_ADMIN_KEY },
    cache: "no-store",
  });
  const clientsData = await clientsRes.json().catch(() => ({}));
  const ssoClients: SsoClient[] =
    clientsRes.ok && Array.isArray(clientsData.clients) ? clientsData.clients : [];

  const managedApps: ManagedApp[] = applications.map((a) => ({
    id: a.id,
    clientId: a.clientId,
    name: a.name,
    description: a.description,
    url: a.url,
    category: a.category,
    enabled: a.enabled,
    openInNewTab: a.openInNewTab,
    _count: a._count,
  }));

  const navItems = getPlatformNav({
    launcher: true,
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
  });

  return (
    <PageShell
      appName="Main"
      header={{
        navItems,
        appsLauncherHref: MAIN_BASE_URL,
        right: me ? (
          <UserMenu name={me.name} email={me.email} role="Super Admin" signOutHref="/api/logout">
            <a href={`${SSO_BASE_URL}/account`}>My Account</a>
            <div className="iipe-dropdown-section">Admin Console</div>
            <a href={apiPath("/admin-console")}>Admin Console</a>
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={adminNavItems("applications")}
    >
      <SessionGuard channel="sanapp-main-session" />
      <Breadcrumb items={adminCrumb("Applications")} />
      <h1 className="iipe-page-title">Applications</h1>
      <p className="iipe-page-sub">
        Registered applications. Each one is an independent Next.js project with its own database,
        roles and business logic. Add or edit an application, then grant it to users on the App
        Matrix.
      </p>

      <div className="iipe-card">
        <ApplicationsManager initialApps={managedApps} ssoClients={ssoClients} />
      </div>
    </PageShell>
  );
}
