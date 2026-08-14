import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPath, Breadcrumb, getPlatformNav, PageShell, SessionGuard, UserMenu } from "sanapp-common-ui";
import { verifyMainSession } from "@/lib/session";
import { adminCrumb, adminNavItems } from "../components/adminNav";

export const dynamic = "force-dynamic";

const SSO_BASE_URL = process.env.SSO_BASE_URL!;
const MAIN_BASE_URL = process.env.MAIN_BASE_URL!;

const CONSOLE_SECTIONS: {
  title: string;
  desc: string;
  href: string;
  icon: string;
}[] = [
  {
    title: "App Matrix",
    desc: "Grant or revoke applications for each user — the central Level 1 access matrix.",
    href: "/admin-console/app-matrix",
    icon: "▦",
  },
  {
    title: "Applications",
    desc: "Register applications, set their URL, OIDC client, category, status and launch behaviour.",
    href: "/admin-console/applications",
    icon: "⬚",
  },
  {
    title: "Users",
    desc: "Add, edit, activate, deactivate or delete users, lock profiles and import via CSV.",
    href: "/admin-console/users",
    icon: "👥",
  },
  {
    title: "Departments",
    desc: "Manage departments / sections and their Heads (HOD).",
    href: "/admin-console/departments",
    icon: "🏛",
  },
  {
    title: "Announcements",
    desc: "Post updates and alerts shown on the login page and across the intranet.",
    href: "/admin-console/announcements",
    icon: "📢",
  },
  {
    title: "Theme & Branding",
    desc: "Choose the platform mode (light / dark / system) and brand colours for every app.",
    href: "/admin-console/theme",
    icon: "🎨",
  },
  {
    title: "Email & SMTP",
    desc: "Configure the SMTP server and From address used to send OTP and notification emails.",
    href: "/admin-console/email",
    icon: "✉️",
  },
];

export default async function AdminConsolePage() {
  const store = await cookies();
  const session = store.get("main_session")?.value ?? "";
  const me = await verifyMainSession(session);
  if (!me) redirect(process.env.MAIN_BASE_URL! + "/api/start-oauth");
  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  if (!isSuperAdmin) redirect("/");

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
          <UserMenu
            name={me.name}
            email={me.email}
            role="Super Admin"
            signOutHref="/api/logout"
          >
            <a href={`${SSO_BASE_URL}/account`}>My Account</a>
            <a href={`${MAIN_BASE_URL}/my-apps`}>My Apps</a>
            <div className="iipe-dropdown-section">Admin Console</div>
            <a href={apiPath("/admin-console")}>Admin Console</a>
          </UserMenu>
        ) : undefined,
      }}
      sidebarItems={adminNavItems("console")}
    >
      <SessionGuard channel="sanapp-main-session" />
      <Breadcrumb items={adminCrumb("Admin Console")} />
      <h1 className="iipe-page-title">Admin Console</h1>
      <p className="iipe-page-sub">
        Central administration for the IIPE intranet — application access, users,
        departments, announcements and the platform theme. These tools are visible
        only to the Super Admin.
      </p>

      <div className="iipe-grid iipe-grid-2">
        {CONSOLE_SECTIONS.map((s) => (
          <a key={s.href} href={apiPath(s.href)} className="iipe-card" style={{ textDecoration: "none", display: "block" }}>
            <div className="iipe-row">
              <span style={{ fontSize: "1.6rem", lineHeight: 1 }}>{s.icon}</span>
              <span className="iipe-spacer" />
              <span className="iipe-badge accent">Open →</span>
            </div>
            <h3 style={{ margin: "12px 0 6px" }}>{s.title}</h3>
            <p style={{ margin: 0, color: "var(--iipe-muted)" }}>{s.desc}</p>
          </a>
        ))}
      </div>
    </PageShell>
  );
}
