import { cookies } from "next/headers";
import { apiPath, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { userNavItems } from "./components/adminNav";
import { verifyMainSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;

function NotFoundBody({ name }: { name?: string }) {
  return (
    <>
      <h1 className="iipe-page-title">404 — Page not found</h1>
      <p className="iipe-page-sub">
        {name ? `${name}, t` : "T"}he page you are looking for does not exist or may have
        been moved.
      </p>
      <div className="iipe-card">
        <div className="iipe-form-actions">
          <a className="iipe-btn" href={apiPath("/")}>
            Back to Dashboard
          </a>
          <a className="iipe-btn secondary" href={MAIN_BASE_URL}>
            Open My Apps
          </a>
        </div>
      </div>
    </>
  );
}

export default async function NotFoundPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  const themeRes = await fetch(`${SSO_BASE_URL}/api/theme`, {
    cache: "no-store",
    signal: AbortSignal.timeout(2000),
  }).then((r) => r.json()).catch(() => ({}));
  const showAccount = !themeRes.accountDisplayDisabled || isSuperAdmin;

  return (
    <PageShell
      appName="Main"
      header={{
        navItems: getPlatformNav({
          launcher: true,
          mainBaseUrl: MAIN_BASE_URL,
          ssoBaseUrl: SSO_BASE_URL,
          active: "home",
        }),
        appsLauncherHref: MAIN_BASE_URL,
        right: me ? (
          <UserMenu
            name={me.name}
            email={me.email}
            role={isSuperAdmin ? "Super Admin" : "User"}
            signOutHref="/api/logout"
          >
            {showAccount && <a href={`${SSO_BASE_URL}/account`}>My Account</a>}
            {isSuperAdmin && (
              <>
                <div className="iipe-dropdown-section">Admin Console</div>
                <a href={apiPath("/admin-console")}>Admin Console</a>
              </>
            )}
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={userNavItems("home")}
    >
      <SessionGuard channel="sanapp-main-session" />
      <NotFoundBody name={me?.name} />
    </PageShell>
  );
}
