import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { apiPath, Breadcrumb, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { adminCrumb, adminNavItems } from "../../../components/adminNav";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { MatrixNavTabs } from "../../../components/MatrixNavTabs";
import { AccessMatrixInspector } from "../../../components/AccessMatrixInspector";
import type { MatrixApp, MatrixGrant, MatrixUser } from "../../../components/matrixTypes";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;
const SSO_ADMIN_KEY = process.env.SSO_ADMIN_KEY!;

type SsoUserRaw = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  primaryRole: string;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  designation: string | null;
  empNo: string | null;
  rollNo: string | null;
  phone: string | null;
  isActive: boolean;
};

export default async function AppMatrixInspectorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; app?: string }>;
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

  const usersRes = await fetch(`${SSO_BASE_URL}/api/admin/users?key=${SSO_ADMIN_KEY}`, { cache: "no-store" });
  const ssoUsers: SsoUserRaw[] = usersRes.ok ? (await usersRes.json()).users : [];

  const applications = await prisma.application.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const grants = await prisma.userApplication.findMany({
    include: { application: true },
  });

  const matrixUsers: MatrixUser[] = ssoUsers.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email ?? null,
    role: u.role || "USER",
    primaryRole: u.primaryRole || "GUEST",
    departmentId: u.departmentId ?? null,
    departmentName: u.department?.name ?? null,
    designation: u.designation ?? null,
    empNo: u.empNo ?? null,
    rollNo: u.rollNo ?? null,
    phone: u.phone ?? null,
    isActive: u.isActive ?? true,
  }));

  const matrixApps: MatrixApp[] = applications.map((a) => ({
    id: a.id,
    clientId: a.clientId,
    name: a.name,
    description: a.description ?? null,
    url: a.url,
    category: a.category || "General",
    enabled: a.enabled,
  }));

  const matrixGrants: MatrixGrant[] = grants.map((g) => ({
    userId: g.userId,
    username: g.username,
    clientId: g.application.clientId,
    role: g.role || "USER",
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
      <Breadcrumb items={adminCrumb("App Matrix - Inspector")} />
      <h1 className="iipe-page-title">Application Access Inspector</h1>
      <p className="iipe-page-sub">
        Inspect coverage, view role-level breakdown statistics, and manage user access for each specific application.
      </p>

      {params.error && (
        <div className="iipe-alert danger">Sign-in error: {params.error}</div>
      )}

      <MatrixNavTabs active="inspector" />

      {ssoUsers.length === 0 ? (
        <div className="iipe-card">
          <div className="iipe-alert danger">
            Could not load the user registry from the SSO. Is sanapp-sso running on port 3000?
          </div>
        </div>
      ) : (
        <AccessMatrixInspector
          users={matrixUsers}
          applications={matrixApps}
          initialGrants={matrixGrants}
          initialApp={params.app}
        />
      )}
    </PageShell>
  );
}
