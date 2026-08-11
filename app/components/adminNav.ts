import type { NavItem } from "iipe-common-ui";

/**
 * Sidebar for the "user" area of the portal (Home, My Apps, Applications,
 * My Account) — the same for every role.
 */
export function userNavItems(
  active?: "home" | "my-apps" | "applications" | "account",
  ssoBaseUrl?: string
): NavItem[] {
  return [
    { label: "Home", href: "/", active: active === "home" },
    { label: "My Apps", href: "/my-apps", active: active === "my-apps" },
    { label: "Applications", href: "/applications", active: active === "applications" },
    { label: "My Account", href: `${ssoBaseUrl ?? "/"}/account`, active: active === "account" },
  ];
}

/**
 * Sidebar shown inside the Admin Console area — super admin options only.
 * The first entry is the "Admin Console" section heading (clickable, links
 * to the console landing page); My Apps / My Account never appear here.
 */
export function adminNavItems(
  active?: "console" | "matrix" | "applications" | "users" | "departments" | "announcements" | "theme"
): NavItem[] {
  return [
    { label: "Admin Console", href: "/admin-console", heading: true, active: active === "console" },
    { label: "App Matrix", href: "/", active: active === "matrix" },
    { label: "Applications", href: "/applications", active: active === "applications" },
    { label: "Users", href: "/users", active: active === "users" },
    { label: "Departments", href: "/departments", active: active === "departments" },
    { label: "Announcements", href: "/announcements", active: active === "announcements" },
    { label: "Theme & Branding", href: "/theme", active: active === "theme" },
  ];
}

/** Breadcrumb trail used on every Admin Console page. */
export function adminCrumb(current: string) {
  return current === "Admin Console"
    ? [{ label: "Admin Console" }]
    : [{ label: "Admin Console", href: "/admin-console" }, { label: current }];
}
