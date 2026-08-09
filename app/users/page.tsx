import { cookies } from "next/headers";
import { getPlatformNav, PageShell, SessionGuard, UserMenu } from "iipe-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { UsersManager, type UserRow } from "../components/UsersManager";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

export default async function UsersPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  // Users come from the SSO user registry; grants come from main_db.
  const usersRes = await fetch(`${SSO_BASE_URL}/api/admin/users?key=${SSO_ADMIN_KEY}`, {
    cache: "no-store",
  });
  const ssoUsers: Array<{ id: string; username: string; name: string; email: string; role: string; isActive: boolean; createdAt: string }> =
    usersRes.ok ? (await usersRes.json()).users : [];

  const grants = await prisma.userApplication.findMany();
  const countByUser = new Map<string, number>();
  for (const g of grants) {
    countByUser.set(g.username, (countByUser.get(g.username) ?? 0) + 1);
  }

  const users: UserRow[] = ssoUsers.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    appCount: countByUser.get(u.username) ?? 0,
  }));

  const navItems = getPlatformNav({
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
  });
  const sidebarItems: { label: string; href: string; active?: boolean }[] = [
    { label: "Home", href: "/" },
    { label: "My Apps", href: "/my-apps" },
    { label: "Applications", href: "/applications" },
    ...(isSuperAdmin ? [{ label: "Users", href: "/users", active: true }] : []),
    { label: "My Account", href: `${SSO_BASE_URL}/account` },
    { label: "SSO (identity)", href: SSO_BASE_URL },
  ];

  return (
    <PageShell
      header={{
        navItems,
        right: me ? (
          <UserMenu name={me.name} email={me.email} role={isSuperAdmin ? "Super Admin" : "User"} signOutHref="/api/logout">
            <a href={`${SSO_BASE_URL}/account`}>My Account</a>
            <a href={`${MAIN_BASE_URL}/my-apps`}>My Apps</a>
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={sidebarItems}
    >
      <SessionGuard channel="iipe-main-session" />
      <h1 className="iipe-page-title">User Management</h1>

      {!isSuperAdmin ? (
        <div className="iipe-card">
          <h2>Super Admin only</h2>
          <p style={{ marginTop: 0 }}>
            User management is restricted to the Super Admin. If you manage application access,
            ask the Super Admin to promote your account.
          </p>
          <a className="iipe-btn secondary" href="/">
            ← Back to dashboard
          </a>
        </div>
      ) : (
        <>
          <p className="iipe-page-sub">
            Add, edit, activate, deactivate or delete users. Identity lives in the SSO (
            <code>sso_db</code>); application access is managed on the{" "}
            <a href="/">access matrix</a>.
          </p>

          {usersRes.ok ? (
            <div className="iipe-card">
              <UsersManager initialUsers={users} />
            </div>
          ) : (
            <div className="iipe-alert">
              Could not load the user registry from the SSO. Is iipe-sso running on port 3000?
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
