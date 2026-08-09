import { cookies } from "next/headers";
import { PageShell, SessionGuard, UserMenu } from "iipe-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { AccessMatrix, type MatrixApp, type MatrixGrant, type MatrixUser } from "./components/AccessMatrix";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);

  // Users come from the SSO user registry (main_db does not store users).
  const usersRes = await fetch(`${SSO_BASE_URL}/api/admin/users?key=${SSO_ADMIN_KEY}`, {
    cache: "no-store",
  });
  const ssoUsers = usersRes.ok ? (await usersRes.json()).users : [];

  // Applications + grants come from main_db.
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

  return (
    <PageShell
      header={{
        navItems: [
          { label: "Dashboard", href: "/", active: true },
          { label: "My Apps", href: "/my-apps" },
          { label: "Applications", href: "/applications" },
        ],
        right: me ? (
          <UserMenu
            name={me.name}
            email={me.email}
            role="Access Administrator"
            signOutHref="/api/logout"
          >
            <a href="http://localhost:3000/account">SSO Profile</a>
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={[
        { label: "Dashboard", href: "/", active: true },
        { label: "My Apps", href: "/my-apps" },
        { label: "Applications", href: "/applications" },
        { label: "SSO (identity)", href: "http://localhost:3000" },
      ]}
    >
      <SessionGuard channel="iipe-main-session" />
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
        {ssoUsers.length === 0 ? (
          <div className="iipe-alert">
            Could not load the user registry from the SSO. Is iipe-sso running on port 3000?
          </div>
        ) : (
          <AccessMatrix
            users={matrixUsers}
            applications={matrixApps}
            initialGrants={matrixGrants}
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
            Users live in <code>sso_db</code>; application metadata and grants live in{" "}
            <code>main_db</code>; each application keeps its own database. Main never reads an
            application&apos;s data.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
