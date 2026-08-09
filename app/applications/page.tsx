import { cookies } from "next/headers";
import { PageShell, SessionGuard, UserMenu } from "iipe-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);

  const applications = await prisma.application.findMany({ orderBy: { name: "asc" } });

  return (
    <PageShell
      header={{
        navItems: [
          { label: "Dashboard", href: "/" },
          { label: "Applications", href: "/applications", active: true },
        ],
        right: me ? (
          <UserMenu name={me.name} email={me.email} role="Access Administrator" signOutHref="/api/logout">
            <a href="http://localhost:3000/account">SSO Profile</a>
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={[
        { label: "Dashboard", href: "/" },
        { label: "My Apps", href: "/my-apps" },
        { label: "Applications", href: "/applications", active: true },
        { label: "SSO (identity)", href: "http://localhost:3000" },
      ]}
    >
      <SessionGuard channel="iipe-main-session" />
      <h1 className="iipe-page-title">Applications</h1>
      <p className="iipe-page-sub">
        Registered applications. Each one is an independent Next.js project with its own database,
        roles and business logic.
      </p>

      <div className="iipe-card">
        <table className="iipe-table">
          <thead>
            <tr>
              <th>Application</th>
              <th>OIDC client</th>
              <th>Status</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{a.name}</strong>
                  {a.description && <div className="iipe-muted">{a.description}</div>}
                </td>
                <td>
                  <code>{a.clientId}</code>
                </td>
                <td>
                  {a.enabled ? (
                    <span className="iipe-badge">Enabled</span>
                  ) : (
                    <span className="iipe-badge danger">Disabled</span>
                  )}
                </td>
                <td>
                  <a href={a.url} target="_blank" rel="noreferrer">
                    {a.url}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
