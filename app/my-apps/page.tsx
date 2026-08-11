import { cookies } from "next/headers";
import { apiPath, getPlatformNav, PageShell, SessionGuard, UserMenu } from "iipe-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { MyAppsView, type MyAppEntry } from "../components/MyAppsView";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;

export default async function MyAppsPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  if (!me) {
    return <p className="iipe-container">Session not found.</p>;
  }

  const grants = await prisma.userApplication.findMany({
    where: { OR: [{ userId: me.sub }, { username: me.username }] },
    include: { application: true },
  });
  const apps: MyAppEntry[] = grants
    .map((g) => g.application)
    .filter((a) => a.enabled)
    .map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      url: a.url,
      category: a.category || "General",
      openInNewTab: a.openInNewTab,
    }));

  const navItems = getPlatformNav({
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
    active: "my-apps",
  });
  const sidebarItems: { label: string; href: string; active?: boolean }[] = [
    { label: "Home", href: "/" },
    { label: "My Apps", href: "/my-apps", active: true },
    { label: "Applications", href: "/applications" },
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
      <h1 className="iipe-page-title">My applications</h1>
      <p className="iipe-page-sub">
        Your applications, grouped by category. Search, switch between cards and list, and click
        any application to jump straight into it — access is managed centrally, roles live inside
        each application.
      </p>

      <MyAppsView initialApps={apps} />
    </PageShell>
  );
}
