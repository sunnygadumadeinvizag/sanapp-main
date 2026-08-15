import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPath, Breadcrumb, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { adminCrumb, adminNavItems } from "../../components/adminNav";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { IssuesClient } from "../../components/IssuesClient";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;

export default async function AdminIssuesPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  if (!me) redirect(process.env.MAIN_BASE_URL! + "/api/start-oauth");
  if (me.role !== "SUPER_ADMIN") redirect("/");

  const apps = await prisma.application.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, url: true },
  });

  const [issues, total] = await Promise.all([
    prisma.technicalIssue.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 10,
      include: { application: { select: { id: true, name: true, url: true } } },
    }),
    prisma.technicalIssue.count(),
  ]);

  const navItems = getPlatformNav({
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
  });

  return (
    <PageShell
      appName="Main"
      header={{
        navItems,
        appsLauncherHref: `${MAIN_BASE_URL}/my-apps`,
        right: me ? (
          <UserMenu name={me.name} email={me.email} role="Super Admin" signOutHref="/api/logout">
            <a href={`${SSO_BASE_URL}/account`}>My Account</a>
            <a href={`${MAIN_BASE_URL}/my-apps`}>My Apps</a>
            <div className="iipe-dropdown-section">Admin Console</div>
            <a href={apiPath("/admin-console")}>Admin Console</a>
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={adminNavItems("issues")}
    >
      <SessionGuard channel="sanapp-main-session" />
      <Breadcrumb items={adminCrumb("Technical Issues")} />
      <h1 className="iipe-page-title">Technical Issues</h1>
      <p className="iipe-page-sub">
        Every issue raised by portal users against an application. Open one to update its status
        and add a resolution reply.
      </p>

      <div className="mt-4">
        <IssuesClient
          apps={apps}
          initialIssues={issues.map((i) => ({
            id: i.id,
            applicationId: i.applicationId,
            application: i.application,
            username: i.username,
            name: i.name,
            title: i.title,
            description: i.description,
            status: i.status,
            priority: i.priority,
            resolution: i.resolution,
            resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
            createdAt: i.createdAt.toISOString(),
          }))}
          initialTotal={total}
          scope="all"
          isSuperAdmin={true}
        />
      </div>
    </PageShell>
  );
}
