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
    launcher: true,
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
    active: "applications",
  });
  const sidebarItems = userNavItems("home");
  const themeRes = await fetch(`${SSO_BASE_URL}/api/theme`, {
    cache: "no-store",
    signal: AbortSignal.timeout(2000),
  }).then((r) => r.json()).catch(() => ({}));
  const showAccount = !themeRes.accountDisplayDisabled || isSuperAdmin;

  return (
    <PageShell
      appName="Main"
      header={{
        navItems,
        appsLauncherHref: MAIN_BASE_URL,
        right: me ? (
          <UserMenu name={me.name} email={me.email} role={isSuperAdmin ? "Super Admin" : "User"} signOutHref="/api/logout">
            {showAccount && <a href={`${SSO_BASE_URL}/account`}>My Account</a>}
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
