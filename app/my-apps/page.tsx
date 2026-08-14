import { cookies } from "next/headers";
import { apiPath, Breadcrumb, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { adminCrumb, adminNavItems, userNavItems } from "../components/adminNav";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { MyAppsView, type MyAppEntry } from "../components/MyAppsView";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;

export default async function MyAppsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const sp = await searchParams;
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
  const sidebarItems = userNavItems("my-apps", SSO_BASE_URL);

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
                <a href={apiPath("/admin-console")}>Admin Console</a>
              </>
            )}
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={sidebarItems}
    >
      <SessionGuard channel="sanapp-main-session" />
      <h1 className="iipe-page-title">My applications</h1>
      <p className="iipe-page-sub">
        Your applications, grouped by category. Search, switch between cards and list, and click
        any application to jump straight into it — access is managed centrally, roles live inside
        each application.
      </p>

      <MyAppsView initialApps={apps} currentPath={sp.from ?? null} />
    </PageShell>
  );
}
