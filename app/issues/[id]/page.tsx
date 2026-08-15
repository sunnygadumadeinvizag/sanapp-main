import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { apiPath, Breadcrumb, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { userNavItems } from "../../components/adminNav";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { IssueDetailClient } from "../../components/IssueDetailClient";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const { id } = await params;

  const issue = await prisma.technicalIssue.findUnique({
    where: { id },
    include: { application: { select: { id: true, name: true, url: true } } },
  });
  if (!issue) notFound();

  const canView =
    !!me &&
    (me.role === "SUPER_ADMIN" || issue.userId === me.sub || issue.username === me.username);
  if (!canView) notFound();

  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  const navItems = getPlatformNav({
    mainBaseUrl: MAIN_BASE_URL,
    ssoBaseUrl: SSO_BASE_URL,
  });
  const sidebarItems = userNavItems("issues", SSO_BASE_URL);

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
      <div className="mb-3">
        <Breadcrumb
          items={[
            { label: "Technical Issues", href: "/issues" },
            { label: issue.application.name },
            { label: issue.title.length > 40 ? issue.title.slice(0, 40) + "…" : issue.title },
          ]}
        />
      </div>

      <IssueDetailClient
        issue={{
          id: issue.id,
          applicationId: issue.applicationId,
          application: issue.application,
          username: issue.username,
          name: issue.name,
          title: issue.title,
          description: issue.description,
          status: issue.status,
          priority: issue.priority,
          resolution: issue.resolution,
          resolvedAt: issue.resolvedAt ? issue.resolvedAt.toISOString() : null,
          createdAt: issue.createdAt.toISOString(),
          updatedAt: issue.updatedAt.toISOString(),
        }}
        isSuperAdmin={!!isSuperAdmin}
      />
    </PageShell>
  );
}
