import { cookies } from "next/headers";
import { apiPath, Breadcrumb, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { adminCrumb, adminNavItems, userNavItems } from "../../components/adminNav";
import { verifyMainSession } from "@/lib/session";
import { ThemeManager } from "../../components/ThemeManager";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;

export default async function ThemePage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  const navItems = getPlatformNav({
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
  });
  const sidebarItems = isSuperAdmin ? adminNavItems("theme") : userNavItems("home", SSO_BASE_URL);

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
      <SessionGuard channel="iipe-main-session" />
      {isSuperAdmin && <Breadcrumb items={adminCrumb("Theme & Branding")} />}
      <h1 className="iipe-page-title">Theme &amp; Branding</h1>

      {!isSuperAdmin ? (
        <div className="iipe-card">
          <h2>Super Admin only</h2>
          <p style={{ marginTop: 0 }}>
            Changing the platform theme is restricted to the Super Admin.
          </p>
          <a className="iipe-btn secondary" href="/admin-console">
            ← Back to dashboard
          </a>
        </div>
      ) : (
        <>
          <p className="iipe-page-sub">
            Choose the <strong>default mode</strong> (light, dark, or system) and the{" "}
            <strong>brand colors</strong> used by every IIPE application. The change is
            stored centrally in the SSO (<code>sso_db</code>) and applies across the whole
            platform; individual users can still override the mode with the header toggle.
          </p>
          <ThemeManager />
        </>
      )}
    </PageShell>
  );
}
