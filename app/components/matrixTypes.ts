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
