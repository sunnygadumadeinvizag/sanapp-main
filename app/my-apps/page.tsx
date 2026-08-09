import { cookies } from "next/headers";
import { PageShell, SessionGuard, UserMenu } from "iipe-common-ui";
import { prisma } from "@/lib/prisma";
import { verifyMainSession } from "@/lib/session";
import { MyAppsView, type MyAppEntry } from "../components/MyAppsView";

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
  const apps: MyAppEntry[] = grants
    .map((g) => g.application)
    .filter((a) => a.enabled)
    .map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      url: a.url,
      category: a.category || "General",
      openInNewTab: a.openInNewTab,
    }));

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
        Your applications, grouped by category. Search, switch between cards and list, and click
        any application to jump straight into it — access is managed centrally, roles live inside
        each application.
      </p>

      <MyAppsView initialApps={apps} />
    </PageShell>
  );
}
