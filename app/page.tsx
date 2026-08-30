import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { apiPath, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { userNavItems } from "./components/adminNav";
import { verifyMainSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MyAppsView, type MyAppEntry } from "./components/MyAppsView";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
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

  // The home page IS the My Apps launcher — applications + grants come from
  // sanapp_main_db and every user lands here right after SSO sign-in.
  const grants = await prisma.userApplication.findMany({
    where: { OR: [{ userId: me.sub }, { username: me.username }] },
    include: { application: true },
  });
  const apps: MyAppEntry[] = grants
    .map((g) => g.application)
    .filter((a) => a.enabled)
    .map((a) => ({
      id: a.id,
      clientId: a.clientId,
      name: a.name,
      description: a.description,
      url: a.url,
      category: a.category || "General",
      openInNewTab: a.openInNewTab,
    }));

  const navItems = getPlatformNav({
    launcher: true,
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
    active: "home",
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
      sidebarItems={sidebarItems}
    >
      <SessionGuard channel="sanapp-main-session" />
      <h1 className="iipe-page-title">My applications</h1>
      <p className="iipe-page-sub">
        Your applications, grouped by category. Star the ones you use often — your favourites
        stay pinned at the top — and click any application to jump straight into it.
      </p>

      {params.error && (
        <div className="iipe-alert danger">Sign-in error: {params.error}</div>
      )}

      <MyAppsView initialApps={apps} currentPath={params.from ?? null} />
    </PageShell>
  );
}
