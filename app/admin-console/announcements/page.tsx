import { cookies } from "next/headers";
import { apiPath, Breadcrumb, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { adminCrumb, adminNavItems, userNavItems } from "../../components/adminNav";
import { verifyMainSession } from "@/lib/session";
import {
  AnnouncementsManager,
  type AnnouncementRow,
} from "../../components/AnnouncementsManager";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

export default async function AnnouncementsPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  const annRes = await fetch(
    `${SSO_BASE_URL}/api/admin/announcements?key=${SSO_ADMIN_KEY}`,
    { cache: "no-store" }
  );
  const ssoAnnouncements: Array<{
    id: string;
    type: "UPDATE" | "ALERT";
    title: string;
    body: string;
    published: boolean;
    createdAt: string;
  }> = annRes.ok ? (await annRes.json()).announcements : [];

  const announcements: AnnouncementRow[] = ssoAnnouncements.map((a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    body: a.body,
    published: a.published,
    createdAt: a.createdAt,
  }));

  const navItems = getPlatformNav({
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
  });
  const sidebarItems = isSuperAdmin ? adminNavItems("announcements") : userNavItems("home", SSO_BASE_URL);

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
      {isSuperAdmin && <Breadcrumb items={adminCrumb("Announcements")} />}
      <h1 className="iipe-page-title">Announcements</h1>

      {!isSuperAdmin ? (
        <div className="iipe-card">
          <h2>Super Admin only</h2>
          <p style={{ marginTop: 0 }}>
            Announcements management is restricted to the Super Admin.
          </p>
          <a className="iipe-btn secondary" href="/admin-console">
            ← Back to dashboard
          </a>
        </div>
      ) : (
        <>
          <p className="iipe-page-sub">
            Post <strong>updates</strong> and <strong>alerts</strong> that appear on
            the SSO login page for everyone signing in. Announcements live in the SSO
            identity registry (<code>sso_db</code>) and are served publicly by the
            SSO.
          </p>

          {annRes.ok ? (
            <div className="iipe-card">
              <AnnouncementsManager initialAnnouncements={announcements} />
            </div>
          ) : (
            <div className="iipe-alert danger">
              Could not load announcements from the SSO. Is the SSO running on port
              3000?
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
