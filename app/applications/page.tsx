import { cookies } from "next/headers";
import { apiPath, getPlatformNav, PageShell, SessionGuard, UserMenu } from "iipe-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { ApplicationsManager, type ManagedApp, type SsoClient } from "../components/ApplicationsManager";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

export default async function ApplicationsPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const isSuperAdmin = me?.role === "SUPER_ADMIN";

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
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
    active: "applications",
  });
  const sidebarItems: { label: string; href: string; active?: boolean }[] = [
    { label: "Home", href: "/" },
    { label: "My Apps", href: "/my-apps" },
    { label: "Applications", href: "/applications", active: true },
    ...(isSuperAdmin
      ? [
          { label: "Users", href: "/users" },
          { label: "Departments", href: "/departments" },
          { label: "Announcements", href: "/announcements" },
          { label: "Theme & Branding", href: "/theme" },
        ]
      : []),
    { label: "My Account", href: `${SSO_BASE_URL}/account` },
  ];

  return (
    <PageShell
      header={{
        navItems,
        right: me ? (
          <UserMenu name={me.name} email={me.email} role={isSuperAdmin ? "Super Admin" : "User"} signOutHref="/api/logout">
            <a href={`${SSO_BASE_URL}/account`}>My Account</a>
            <a href={`${MAIN_BASE_URL}/my-apps`}>My Apps</a>
            {isSuperAdmin && (
              <>
                <div className="iipe-dropdown-section">Admin Console</div>
                <a href={apiPath("/")}>App Matrix</a>
                <a href={apiPath("/applications")}>Applications</a>
                <a href={apiPath("/users")}>Users</a>
                <a href={apiPath("/departments")}>Departments</a>
                <a href={apiPath("/announcements")}>Announcements</a>
                <a href={apiPath("/theme")}>Theme &amp; Branding</a>
              </>
            )}
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={sidebarItems}
    >
      <SessionGuard channel="iipe-main-session" />
      <h1 className="iipe-page-title">Applications</h1>
      <p className="iipe-page-sub">
        Registered applications. Each one is an independent Next.js project with its own database,
        roles and business logic.
      </p>

      {isSuperAdmin ? (
        <div className="iipe-card">
          <ApplicationsManager initialApps={managedApps} ssoClients={ssoClients} />
        </div>
      ) : (
        <div className="iipe-card">
          <div className="iipe-table-scroll">
            <table className="iipe-table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Category</th>
                  <th>OIDC client</th>
                  <th>Status</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.name}</strong>
                      {a.description && <div className="iipe-muted">{a.description}</div>}
                    </td>
                    <td>
                      <span className="iipe-badge">{a.category || "General"}</span>
                    </td>
                    <td>
                      <code>{a.clientId}</code>
                    </td>
                    <td>
                      {a.enabled ? (
                        <span className="iipe-badge">Enabled</span>
                      ) : (
                        <span className="iipe-badge danger">Disabled</span>
                      )}
                    </td>
                    <td>
                      <a href={a.url} target="_blank" rel="noreferrer">
                        {a.url}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  );
}
