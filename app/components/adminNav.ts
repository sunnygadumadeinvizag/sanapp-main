import type { NavItem } from "sanapp-common-ui";

/**
 * Sidebar for the "user" area of the portal. The home page itself IS the My
 * Apps launcher (grouped by category, with favourites), so the sidebar is just
 * Home + App Notifications — account/platform links live in the header.
 */
export function userNavItems(active?: "home" | "notifications"): NavItem[] {
  return [
    { label: "Home", href: "/", active: active === "home" },
    { label: "App Notifications", href: "/notifications", active: active === "notifications" },
  ];
}

/**
 * Sidebar shown inside the Admin Console area — super admin options only.
 * The first entry is the "Admin Console" section heading (clickable, links
 * to the console landing page); My Apps / My Account never appear here.
 * Every admin function lives under /admin-console/<function>.
 */
export function adminNavItems(
  active?: "console" | "matrix" | "applications" | "users" | "departments" | "announcements" | "theme" | "email"
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
  ];
}

/** Breadcrumb trail used on every Admin Console page. */
export function adminCrumb(current: string) {
  return current === "Admin Console"
    ? [{ label: "Admin Console" }]
    : [{ label: "Admin Console", href: "/admin-console" }, { label: current }];
}
