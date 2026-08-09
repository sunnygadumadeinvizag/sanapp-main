import { cookies } from "next/headers";
import { PageShell, SessionGuard, UserMenu } from "iipe-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function MyAppsPage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);

  if (!me) {
    return <p className="iipe-container">Session not found.</p>;
  }

  const grants = await prisma.userApplication.findMany({
    where: { OR: [{ userId: me.sub }, { username: me.username }] },
    include: { application: true },
  });
  const apps = grants
    .map((g) => g.application)
    .filter((a) => a.enabled);

  const navItems = [
    { label: "Dashboard", href: "/" },
    { label: "My Apps", href: "/my-apps", active: true },
    { label: "Applications", href: "/applications" },
  ];

  return (
    <PageShell
      header={{
        navItems,
        right: me ? (
          <UserMenu name={me.name} email={me.email} role="Access Administrator" signOutHref="/api/logout">
            <a href="http://localhost:3000/account">SSO Profile</a>
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={[
        ...navItems,
        { label: "SSO (identity)", href: "http://localhost:3000" },
      ]}
    >
      <SessionGuard channel="iipe-main-session" />
      <h1 className="iipe-page-title">My applications</h1>
      <p className="iipe-page-sub">
        Every application you can open — click one to jump straight into it. Access is managed
        centrally; each application keeps its own roles.
      </p>

      {apps.length === 0 ? (
        <div className="iipe-card">
          <div className="iipe-alert">
            You don&apos;t have access to any application yet. Ask an administrator to grant
            access from the <a href="/">access matrix</a>.
          </div>
        </div>
      ) : (
        <div className="iipe-grid iipe-grid-2">
          {apps.map((a) => (
            <div className="iipe-card" key={a.id}>
              <div className="iipe-row">
                <h2 style={{ margin: 0 }}>{a.name}</h2>
                <span className="iipe-spacer" />
                <span className="iipe-badge">Access granted</span>
              </div>
              {a.description && (
                <p className="iipe-muted" style={{ marginTop: 6 }}>
                  {a.description}
                </p>
              )}
              <a
                className="iipe-btn"
                href={a.url}
                target={a.openInNewTab ? "_blank" : "_self"}
                rel={a.openInNewTab ? "noreferrer" : undefined}
              >
                Open {a.name}
                {a.openInNewTab ? " ↗" : ""}
              </a>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
