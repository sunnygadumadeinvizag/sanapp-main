import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { apiPath, Breadcrumb, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { adminCrumb, adminNavItems } from "../../components/adminNav";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { AccessMatrix, type MatrixApp, type MatrixGrant, type MatrixUser } from "../../components/AccessMatrix";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

export default async function AppMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; user?: string }>;
}) {
  const params = await searchParams;
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  if (!me) {
    redirect(process.env.MAIN_BASE_URL! + "/api/start-oauth");
  }
  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  if (!isSuperAdmin) redirect("/");

  // Users come from the SSO user registry (sanapp_main_db does not store users).
  const usersRes = await fetch(`${SSO_BASE_URL}/api/admin/users?key=${SSO_ADMIN_KEY}`, {
    cache: "no-store",
  });
  const ssoUsers = usersRes.ok ? (await usersRes.json()).users : [];

  // Applications + grants come from sanapp_main_db.
  const applications = await prisma.application.findMany({ orderBy: { name: "asc" } });
  const grants = await prisma.userApplication.findMany({
    include: { application: true },
  });

  const matrixUsers: MatrixUser[] = ssoUsers.map((u: { id: string; username: string; name: string }) => ({
    id: u.id,
    username: u.username,
    name: u.name,
  }));
  const matrixApps: MatrixApp[] = applications.map((a) => ({
    clientId: a.clientId,
    name: a.name,
    url: a.url,
    enabled: a.enabled,
  }));
  const matrixGrants: MatrixGrant[] = grants.map((g) => ({
    userId: g.userId,
    username: g.username,
    clientId: g.application.clientId,
  }));

  const navItems = getPlatformNav({
    launcher: true,
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
  });

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
            role="Super Admin"
            signOutHref="/api/logout"
          >
            <a href={`${SSO_BASE_URL}/account`}>My Account</a>
            <div className="iipe-dropdown-section">Admin Console</div>
            <a href={apiPath("/admin-console")}>Admin Console</a>
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={adminNavItems("matrix")}
    >
      <SessionGuard channel="sanapp-main-session" />
      <Breadcrumb items={adminCrumb("App Matrix")} />
      <h1 className="iipe-page-title">Central Application Access</h1>
      <p className="iipe-page-sub">
        Level 1 authorization — <strong>can this user open this application?</strong> Roles and
        permissions inside each application are managed by the application itself.
      </p>

      {params.error && (
        <div className="iipe-alert danger">Sign-in error: {params.error}</div>
      )}

      <div className="iipe-card">
        <div className="iipe-row">
          <h2 style={{ marginBottom: 4 }}>Access matrix</h2>
          <span className="iipe-spacer" />
          {me && <span className="iipe-badge accent">Signed in as {me.username}</span>}
        </div>
        <p className="iipe-muted" style={{ marginTop: 0 }}>
          Tick a box to grant (or revoke) an application for a user. The change takes effect on
          that user&apos;s next visit to the application.
        </p>
        {params.user && (
          <div className="iipe-alert" style={{ marginBottom: 12 }}>
            Showing app access for <strong>{params.user}</strong> — manage users on the{" "}
            <a href={apiPath("/admin-console/users")}>Users</a> page.
          </div>
        )}
        {ssoUsers.length === 0 ? (
          <div className="iipe-alert">
            Could not load the user registry from the SSO. Is sanapp-sso running on port 3000?
          </div>
        ) : (
          <AccessMatrix
            users={matrixUsers}
            applications={matrixApps}
            initialGrants={matrixGrants}
            focusUsername={params.user}
          />
        )}
      </div>

      <div className="iipe-grid iipe-grid-2">
        <div className="iipe-card">
          <h2>Why this matters</h2>
          <p style={{ marginTop: 0 }}>
            The SSO answers <em>who are you?</em> (identity). Main answers{" "}
            <em>can you access this application?</em> (Level 1). Each application answers{" "}
            <em>what can you do inside it?</em> (Level 2, its own roles).
          </p>
        </div>
        <div className="iipe-card">
          <h2>Database isolation</h2>
          <p style={{ marginTop: 0 }}>
            Users live in <code>sanapp_sso_db</code>; application metadata and grants live in{" "}
            <code>sanapp_main_db</code>; each application keeps its own database. Main never reads an
            application&apos;s data.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
