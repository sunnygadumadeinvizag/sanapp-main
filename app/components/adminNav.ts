import type { NavItem } from "sanapp-common-ui";

/**
 * Sidebar for the "user" area of the portal (Home, My Apps, Applications,
 * My Account) — the same for every role.
 */
export function userNavItems(
  active?: "home" | "my-apps" | "applications" | "issues" | "account",
  ssoBaseUrl?: string
): NavItem[] {
  return [
    { label: "Home", href: "/", active: active === "home" },
    { label: "My Apps", href: "/my-apps", active: active === "my-apps" },
    { label: "Applications", href: "/applications", active: active === "applications" },
    { label: "Technical Issues", href: "/issues", active: active === "issues" },
    { label: "My Account", href: `${ssoBaseUrl ?? "/"}/account`, active: active === "account" },
  ];
}

/**
 * Sidebar shown inside the Admin Console area — super admin options only.
 * The first entry is the "Admin Console" section heading (clickable, links
 * to the console landing page); My Apps / My Account never appear here.
 * Every admin function lives under /admin-console/<function>.
 */
export function adminNavItems(
  active?: "console" | "matrix" | "applications" | "users" | "departments" | "announcements" | "theme" | "email" | "issues"
): NavItem[] {
  return [
    { label: "Admin Console", href: "/admin-console", heading: true, active: active === "console" },
    { label: "App Matrix", href: "/admin-console/app-matrix", active: active === "matrix" },
    { label: "Applications", href: "/admin-console/applications", active: active === "applications" },
    { label: "Users", href: "/admin-console/users", active: active === "users" },
    { label: "Departments", href: "/admin-console/departments", active: active === "departments" },
    { label: "Announcements", href: "/admin-console/announcements", active: active === "announcements" },
    { label: "Theme & Branding", href: "/admin-console/theme", active: active === "theme" },
    { label: "Email & SMTP", href: "/admin-console/email", active: active === "email" },
    { label: "Technical Issues", href: "/admin-console/issues", active: active === "issues" },
  ];
}

/** Breadcrumb trail used on every Admin Console page. */
export function adminCrumb(current: string) {
  return current === "Admin Console"
    ? [{ label: "Admin Console" }]
    : [{ label: "Admin Console", href: "/admin-console" }, { label: current }];
}
