import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { apiPath, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { userNavItems } from "./components/adminNav";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  // The proxy does not run for the exact basePath root (/main), so guard it here.
  if (!me) {
    redirect(process.env.MAIN_BASE_URL! + "/api/start-oauth");
  }
  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  // Applications + grants come from sanapp_main_db.
  const applications = await prisma.application.findMany({ orderBy: { name: "asc" } });
  const grants = await prisma.userApplication.findMany({});

  const myApps = applications.filter((a) =>
    grants.some((g) => g.username === me?.username && g.applicationId === a.id && a.enabled)
  );

  const navItems = getPlatformNav({
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
    active: "home",
  });
  const sidebarItems = userNavItems("home", SSO_BASE_URL);

  return (
    <PageShell
      appName="Main"
      header={{
        navItems,
        appsLauncherHref: `${MAIN_BASE_URL}/my-apps`,
        right: me ? (
          <UserMenu
            name={me.name}
            email={me.email}
            role={isSuperAdmin ? "Super Admin" : "User"}
            signOutHref="/api/logout"
          >
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
      <h1 className="iipe-page-title">Welcome, {me.name}</h1>
      <p className="iipe-page-sub">
        Your applications are assigned by the Super Admin. Each application manages its own
        roles and permissions inside it.
      </p>

      {params.error && (
        <div className="iipe-alert danger">Sign-in error: {params.error}</div>
      )}

      <div className="iipe-card">
        <div className="iipe-row" style={{ marginBottom: 8 }}>
          <h2 style={{ marginBottom: 0 }}>Your applications</h2>
          <span className="iipe-spacer" />
          <a className="iipe-btn secondary" href="/my-apps">
            Open My Apps launcher →
          </a>
        </div>
        <p style={{ marginTop: 0 }}>
          You have access to {myApps.length} application{myApps.length === 1 ? "" : "s"}. Your
          application roles and permissions are managed inside each application.
        </p>
        {myApps.length === 0 ? (
          <div className="iipe-alert">
            No applications are assigned to you yet. Contact the Super Admin to request access.
          </div>
        ) : (
          <div className="iipe-grid iipe-grid-2">
            {myApps.map((a) => (
              <div key={a.id} className="iipe-card" style={{ marginBottom: 0 }}>
                <h3 style={{ marginBottom: 4 }}>{a.name}</h3>
                {a.description && <p className="iipe-muted" style={{ marginTop: 0 }}>{a.description}</p>}
                <a
                  className="iipe-btn"
                  href={a.url}
                  target={a.openInNewTab ? "_blank" : "_self"}
                  rel={a.openInNewTab ? "noreferrer" : undefined}
                >
                  Open application {a.openInNewTab ? "↗" : "→"}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
