import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { apiPath, Breadcrumb, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { userNavItems } from "../../components/adminNav";
import { verifyMainSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { IssueDetailClient } from "../../components/IssueDetailClient";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;
const LOGREQUEST_BASE_URL = process.env.LOGREQUEST_BASE_URL ?? "";
const INTERNAL_KEY = process.env.LOGREQUEST_INTERNAL_KEY ?? "";

export default async function IssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  const { id } = await params;

  // Issues live in Log Request (Intranet Issue category).
  const res = await fetch(`${LOGREQUEST_BASE_URL}/api/internal/issues/${id}`, {
    headers: { "x-internal-key": INTERNAL_KEY },
    cache: "no-store",
  });
  if (!res.ok) notFound();
  const data = await res.json();
  const r = data.issue;

  const canView =
    !!me &&
    (me.role === "SUPER_ADMIN" || r.requestedBy?.username === me.username);
  if (!canView) notFound();

  const regApp = r.appName
    ? await prisma.application.findFirst({ where: { name: r.appName, enabled: true }, select: { id: true, name: true, url: true } })
    : null;
  const issue: {
    id: string;
    applicationId: string;
    application: { id: string; name: string; url: string };
    username: string;
    name: string;
    title: string;
    description: string;
    status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    resolution: string | null;
    resolvedAt: string | null;
    createdAt: string;
    updatedAt: string;
  } = {
    id: r.id,
    applicationId: regApp?.id ?? r.appName ?? "",
    application: regApp ?? { id: r.appName ?? "", name: r.appName ?? "Intranet", url: "" },
    username: r.requestedBy?.username ?? "",
    name: r.requestedBy?.name ?? "",
    title: r.title,
    description: r.description,
    status: (r.status === "IN_PROGRESS" || r.status === "PENDING" ? "IN_PROGRESS" : r.status === "RESOLVED" ? "RESOLVED" : r.status === "CLOSED" ? "CLOSED" : "OPEN") as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED",
    priority: (["LOW", "MEDIUM", "HIGH", "URGENT"].includes(r.priority) ? r.priority : "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
    resolution: r.resolution,
    resolvedAt: r.resolvedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? r.createdAt,
  };

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
            { label: "Technical Issues", href: apiPath("/issues") },
            { label: issue.title },
          ]}
        />
      </div>
      <IssueDetailClient issue={issue} isSuperAdmin={isSuperAdmin} />
    </PageShell>
  );
}
