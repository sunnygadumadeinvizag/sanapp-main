import { cookies } from "next/headers";
import { apiPath, getPlatformNav, PageShell, SessionGuard, UserMenu } from "iipe-common-ui";
import { verifyMainSession } from "@/lib/session";
import {
  DepartmentsManager,
  type DepartmentRow,
  type HodOption,
} from "../components/DepartmentsManager";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

export default async function DepartmentsPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  const deptRes = await fetch(`${SSO_BASE_URL}/api/admin/departments?key=${SSO_ADMIN_KEY}`, {
    cache: "no-store",
  });
  const ssoDepartments: Array<{
    id: string;
    name: string;
    headId: string | null;
    head: { name: string; username: string } | null;
    _count: { users: number };
  }> = deptRes.ok ? (await deptRes.json()).departments : [];

  const departments: DepartmentRow[] = ssoDepartments.map((d) => ({
    id: d.id,
    name: d.name,
    headId: d.headId,
    headName: d.head?.name ?? null,
    headUsername: d.head?.username ?? null,
    memberCount: d._count.users,
  }));

  // HOD candidates: staff users (teaching + non-teaching).
  const usersRes = await fetch(`${SSO_BASE_URL}/api/admin/users?key=${SSO_ADMIN_KEY}`, {
    cache: "no-store",
  });
  const ssoUsers: Array<{ id: string; name: string; username: string; primaryRole: string }> =
    usersRes.ok ? (await usersRes.json()).users : [];
  const hodOptions: HodOption[] = ssoUsers
    .filter((u) => u.primaryRole === "STAFF_TEACHING" || u.primaryRole === "STAFF_NON_TEACHING")
    .map((u) => ({ id: u.id, name: u.name, username: u.username }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const navItems = getPlatformNav({
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
  });
  const sidebarItems: { label: string; href: string; active?: boolean }[] = [
    { label: "Home", href: "/" },
    { label: "My Apps", href: "/my-apps" },
    { label: "Applications", href: "/applications" },
    ...(isSuperAdmin
      ? [
          { label: "Users", href: "/users" },
          { label: "Departments", href: "/departments", active: true },
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
      <h1 className="iipe-page-title">Departments &amp; Sections</h1>

      {!isSuperAdmin ? (
        <div className="iipe-card">
          <h2>Super Admin only</h2>
          <p style={{ marginTop: 0 }}>
            Department management is restricted to the Super Admin.
          </p>
          <a className="iipe-btn secondary" href="/">
            ← Back to dashboard
          </a>
        </div>
      ) : (
        <>
          <p className="iipe-page-sub">
            Every user belongs to a department / section, and each department may have a
            Head of Department. Departments live in the SSO identity registry (
            <code>sso_db</code>).
          </p>

          {deptRes.ok ? (
            <div className="iipe-card">
              <DepartmentsManager
                initialDepartments={departments}
                hodOptions={hodOptions}
              />
            </div>
          ) : (
            <div className="iipe-alert danger">
              Could not load departments from the SSO. Is the SSO running on port 3000?
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
