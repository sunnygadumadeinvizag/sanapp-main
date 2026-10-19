export type MatrixUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  primaryRole: string;
  departmentId: string | null;
  departmentName: string | null;
  designation: string | null;
  empNo: string | null;
  rollNo: string | null;
  phone: string | null;
  isActive: boolean;
};

export type MatrixApp = {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  url: string;
  category: string;
  enabled: boolean;
};

export type MatrixGrant = {
  userId: string | null;
  username: string;
  clientId: string;
  role?: "USER" | "APP_ADMIN" | string;
  /** ALLOW (default) or DENY — an explicit per-user block. */
  effect?: "ALLOW" | "DENY" | string;
};

/** A rule for a whole primary role: "this role gets this decision on this app". */
export type RoleRule = {
  primaryRole: string;
  clientId: string;
  role?: "USER" | "APP_ADMIN" | string;
  /** ALLOW (default) or DENY for the whole role. */
  effect?: "ALLOW" | "DENY" | string;
  /** When true the role rule wins over direct per-user rows. */
  overrideUsers?: boolean;
};

/** How a user's access was decided, mirroring src/lib/access.ts precedence. */
export type EffectiveDecision = {
  /** Effective role when allowed. */
  role: "USER" | "APP_ADMIN" | string;
  allowed: boolean;
  effect: "ALLOW" | "DENY";
  source: "direct" | "role";
  /** True when a role rule set to override users decided the outcome. */
  overrodeUser: boolean;
};

export type DepartmentOption = {
  id: string;
  name: string;
};

export const PRIMARY_ROLES: { value: string; label: string; badgeColor: string }[] = [
  { value: "STAFF_TEACHING", label: "Staff (Teaching)", badgeColor: "#0b5d4f" },
  { value: "STAFF_NON_TEACHING", label: "Staff (Non-Teaching)", badgeColor: "#1a5d8f" },
  { value: "STUDENT", label: "Student", badgeColor: "#9a6b00" },
  { value: "SCHOLAR", label: "Scholar", badgeColor: "#6b3ba7" },
  { value: "GUEST", label: "Guest", badgeColor: "#5f6f6b" },
];

export function getRoleLabel(roleKey: string): string {
  const r = PRIMARY_ROLES.find((pr) => pr.value === roleKey);
  return r ? r.label : roleKey;
}
