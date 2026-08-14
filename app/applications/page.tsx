import { cookies } from "next/headers";
import { getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { userNavItems } from "../components/adminNav";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;

export default async function ApplicationsPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  const applications = await prisma.application.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const navItems = getPlatformNav({
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
    active: "applications",
  });
  const sidebarItems = userNavItems("applications", SSO_BASE_URL);

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
                <a href={`${MAIN_BASE_URL}/admin-console`}>Admin Console</a>
              </>
            )}
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={sidebarItems}
    >
      <SessionGuard channel="sanapp-main-session" />
      <h1 className="iipe-page-title">Applications</h1>
      <p className="iipe-page-sub">
        Every application on the IIPE intranet is an independent Next.js project with its own
        database, roles and business logic. Access is granted centrally by the Super Admin.
      </p>

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
    </PageShell>
  );
}
