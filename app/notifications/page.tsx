import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { apiPath, AppNotificationsView, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { userNavItems } from "../components/adminNav";
import { verifyMainSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;

export default async function NotificationsPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  if (!me) {
    redirect(process.env.MAIN_BASE_URL! + "/api/start-oauth");
  }
  const isSuperAdmin = me.role === "SUPER_ADMIN";

  const navItems = getPlatformNav({
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
    active: "home",
  });

  return (
    <PageShell
      appName="Main"
      header={{
        navItems,
        appsLauncherHref: MAIN_BASE_URL,
        right: (
          <UserMenu
            name={me.name}
            email={me.email}
            role={isSuperAdmin ? "Super Admin" : "User"}
            signOutHref="/api/logout"
          >
            <a href={`${SSO_BASE_URL}/account`}>My Account</a>
            {isSuperAdmin && (
              <>
                <div className="iipe-dropdown-section">Admin Console</div>
                <a href={apiPath("/admin-console")}>Admin Console</a>
              </>
            )}
          </UserMenu>
        ),
      }}
      sidebarItems={userNavItems("notifications")}
    >
      <SessionGuard channel="sanapp-main-session" />
      <h1 className="iipe-page-title">Notifications</h1>
      <p className="iipe-page-sub">
        Everything the intranet has notified you about — centralized in Main and grouped by the
        application that raised each alert. The bell in every application's header shows the same
        list.
      </p>
      <div className="mt-4">
        <AppNotificationsView appName="Main" />
      </div>
    </PageShell>
  );
}
