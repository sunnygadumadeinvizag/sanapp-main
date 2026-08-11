import { cookies } from "next/headers";
import { apiPath, getPlatformNav, PageShell, SessionGuard, UserMenu } from "iipe-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { UsersManager, type UserRow, type Option } from "../components/UsersManager";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

type SsoUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  primaryRole: string;
  employmentType: string | null;
  designation: string | null;
  phone: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  programmeId: string | null;
  programme: { id: string; name: string } | null;
  courseId: string | null;
  course: { id: string; name: string } | null;
  guideId: string | null;
  guide: { id: string; name: string } | null;
  rollNo: string | null;
  empNo: string | null;
  gender: string | null;
  phCategory: string | null;
  nonInstituteEmail: string | null;
  emergencyPhone: string | null;
  isActive: boolean;
  avatar: string | null;
  profileLocked: boolean;
  createdAt: string;
};

export default async function UsersPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const isSuperAdmin = me?.role === "SUPER_ADMIN";

  // Users come from the SSO user registry; grants come from main_db.
  const [usersRes, policyRes] = await Promise.all([
    fetch(`${SSO_BASE_URL}/api/admin/users?key=${SSO_ADMIN_KEY}`, {
      cache: "no-store",
    }),
    fetch(`${SSO_BASE_URL}/api/admin/profile-policy?key=${SSO_ADMIN_KEY}`, {
      cache: "no-store",
    }),
  ]);
  const ssoUsers: SsoUser[] = usersRes.ok ? (await usersRes.json()).users : [];
  const initialPolicy: string[] = policyRes.ok
    ? ((await policyRes.json()).locked ?? [])
    : [];

  const grants = await prisma.userApplication.findMany();
  const countByUser = new Map<string, number>();
  for (const g of grants) {
    countByUser.set(g.username, (countByUser.get(g.username) ?? 0) + 1);
  }

  const users: UserRow[] = ssoUsers.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email ?? "",
    role: u.role,
    primaryRole: u.primaryRole,
    employmentType: u.employmentType,
    designation: u.designation,
    phone: u.phone,
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    programmeId: u.programmeId,
    programmeName: u.programme?.name ?? null,
    courseId: u.courseId,
    courseName: u.course?.name ?? null,
    guideId: u.guideId,
    guideName: u.guide?.name ?? null,
    rollNo: u.rollNo,
    empNo: u.empNo,
    gender: u.gender,
    phCategory: u.phCategory,
    nonInstituteEmail: u.nonInstituteEmail,
    emergencyPhone: u.emergencyPhone,
    isActive: u.isActive,
    avatar: u.avatar,
    profileLocked: u.profileLocked,
    createdAt: u.createdAt,
    appCount: countByUser.get(u.username) ?? 0,
  }));

  // Taxonomy for the add/edit modal.
  const [deptRes, progRes, courseRes] = await Promise.all([
    fetch(`${SSO_BASE_URL}/api/admin/departments?key=${SSO_ADMIN_KEY}`, { cache: "no-store" }),
    fetch(`${SSO_BASE_URL}/api/admin/programmes?key=${SSO_ADMIN_KEY}`, { cache: "no-store" }),
    fetch(`${SSO_BASE_URL}/api/admin/courses?key=${SSO_ADMIN_KEY}`, { cache: "no-store" }),
  ]);

  const departments: Option[] = deptRes.ok
    ? ((await deptRes.json()).departments ?? []).map((d: { id: string; name: string }) => ({
        id: d.id,
        name: d.name,
      }))
    : [];
  const programmes: Option[] = progRes.ok
    ? ((await progRes.json()).programmes ?? []).map((p: { id: string; name: string }) => ({
        id: p.id,
        name: p.name,
      }))
    : [];
  const courses: Option[] = courseRes.ok
    ? ((await courseRes.json()).courses ?? []).map((c: { id: string; name: string }) => ({
        id: c.id,
        name: c.name,
      }))
    : [];

  // Guides = staff teaching users.
  const guides: Option[] = ssoUsers
    .filter((u) => u.primaryRole === "STAFF_TEACHING")
    .map((u) => ({ id: u.id, name: u.name }))
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
          { label: "Users", href: "/users", active: true },
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
            <a href={apiPath("/")}>access matrix</a>. Every user is identified by a primary role and a
            department / section.
          </p>

          {usersRes.ok ? (
            <div className="iipe-card">
              <UsersManager
                initialUsers={users}
                departments={departments}
                programmes={programmes}
                courses={courses}
                guides={guides}
                ssoBaseUrl={SSO_BASE_URL}
                initialPolicy={initialPolicy}
              />
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
