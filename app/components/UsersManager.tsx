"use client";
import { apiPath } from "sanapp-common-ui";

import { useEffect, useMemo, useState } from "react";
import { exportUsersXlsx } from "../lib/exportUsersXlsx";
import "./users-manager.css";

export type UserRow = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  primaryRole: string;
  employmentType: string | null;
  designation: string | null;
  phone: string | null;
  rollNo: string | null;
  empNo: string | null;
  gender: string | null;
  phCategory: string | null;
  nonInstituteEmail: string | null;
  emergencyPhone: string | null;
  departmentId: string | null;
  departmentName: string | null;
  programmeId: string | null;
  programmeName: string | null;
  courseId: string | null;
  courseName: string | null;
  guideId: string | null;
  guideName: string | null;
  natureOfAdmission: string | null;
  discipline: string | null;
  admissionYear: string | null;
  admissionSemester: string | null;
  admissionCategory: string | null;
  isActive: boolean;
  isTest: boolean;
  avatar: string | null;
  profileLocked: boolean;
  createdAt: string;
  appCount: number;
};

export type Option = { id: string; name: string };

const PRIMARY_ROLES = [
  { value: "STAFF_NON_TEACHING", label: "Staff — Non-Teaching" },
  { value: "STAFF_TEACHING", label: "Staff — Teaching" },
  { value: "STUDENT", label: "Student" },
  { value: "SCHOLAR", label: "Scholar" },
  { value: "GUEST", label: "Guest" },
];

const EMPLOYMENT_TYPES = [
  { value: "REGULAR", label: "Regular" },
  { value: "CONTRACTUAL", label: "Contractual" },
  { value: "VISITING", label: "Visiting" },
  { value: "OUTSOURCING", label: "Outsourcing" },
  { value: "PROJECT_STAFF", label: "Project Staff" },
  { value: "OTHER", label: "Other" },
];

const GENDERS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

const PH_CATEGORIES = [
  { value: "NONE", label: "None" },
  { value: "OH", label: "Orthopaedically Handicapped (OH)" },
  { value: "VI", label: "Visually Impaired (VI)" },
  { value: "HI", label: "Hearing Impaired (HI)" },
  { value: "LD", label: "Learning Disability (LD)" },
  { value: "MD", label: "Multiple Disabilities (MD)" },
  { value: "OTHER", label: "Other" },
];

type Draft = {
  name: string;
  username: string;
  email: string;
  password: string;
  role: "USER" | "SUPER_ADMIN";
  isActive: boolean;
  primaryRole: string;
  employmentType: string;
  designation: string;
  phone: string;
  rollNo: string;
  empNo: string;
  gender: string;
  phCategory: string;
  nonInstituteEmail: string;
  emergencyPhone: string;
  departmentId: string;
  programmeId: string;
  courseId: string;
  guideId: string;
};

type ModalState = { mode: "add" } | { mode: "edit"; user: UserRow } | null;

type ImportResult = {
  created: number;
  failed: number;
  errors: Array<{ row: number; username: string; error: string }>;
};

type SortKey =
  | "name"
  | "username"
  | "email"
  | "primaryRole"
  | "department"
  | "status"
  | "apps"
  | "createdAt";

type SortDir = "asc" | "desc";

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

function roleLabel(value: string) {
  return PRIMARY_ROLES.find((r) => r.value === value)?.label ?? value.replace(/_/g, " ");
}

function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  const av = a == null ? "" : String(a);
  const bv = b == null ? "" : String(b);
  const cmp = av.localeCompare(bv, undefined, { sensitivity: "base", numeric: true });
  return dir === "asc" ? cmp : -cmp;
}

function pageWindow(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  if (current <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= total - 2) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
  }
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  username: "",
  email: "",
  password: "",
  role: "USER",
  isActive: true,
  primaryRole: "",
  employmentType: "",
  designation: "",
  phone: "",
  rollNo: "",
  empNo: "",
  gender: "",
  phCategory: "",
  nonInstituteEmail: "",
  emergencyPhone: "",
  departmentId: "",
  programmeId: "",
  courseId: "",
  guideId: "",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/**
 * The SSO returns users with nested relation objects (department: { id, name }).
 * Normalize that shape into the flat UserRow used by this table so a lock /
 * activate / edit response keeps the department and profile details visible.
 */
function rowFromUser(u: Record<string, unknown>, appCount: number): UserRow {
  const dep = u.department as { id: string; name: string } | null | undefined;
  const prog = u.programme as { id: string; name: string } | null | undefined;
  const crs = u.course as { id: string; name: string } | null | undefined;
  const guide = u.guide as { id: string; name: string } | null | undefined;
  return {
    id: String(u.id),
    username: String(u.username),
    name: String(u.name),
    email: u.email ? String(u.email) : "",
    role: String(u.role ?? "USER"),
    primaryRole: String(u.primaryRole ?? "GUEST"),
    employmentType: u.employmentType ? String(u.employmentType) : null,
    designation: u.designation ? String(u.designation) : null,
    phone: u.phone ? String(u.phone) : null,
    rollNo: u.rollNo ? String(u.rollNo) : null,
    empNo: u.empNo ? String(u.empNo) : null,
    gender: u.gender ? String(u.gender) : null,
    phCategory: u.phCategory ? String(u.phCategory) : null,
    nonInstituteEmail: u.nonInstituteEmail ? String(u.nonInstituteEmail) : null,
    emergencyPhone: u.emergencyPhone ? String(u.emergencyPhone) : null,
    departmentId: u.departmentId ? String(u.departmentId) : null,
    departmentName: dep?.name ?? null,
    programmeId: u.programmeId ? String(u.programmeId) : null,
    programmeName: prog?.name ?? null,
    courseId: u.courseId ? String(u.courseId) : null,
    courseName: crs?.name ?? null,
    guideId: u.guideId ? String(u.guideId) : null,
    guideName: guide?.name ?? null,
    natureOfAdmission: u.natureOfAdmission ? String(u.natureOfAdmission) : null,
    discipline: u.discipline ? String(u.discipline) : null,
    admissionYear: u.admissionYear ? String(u.admissionYear) : null,
    admissionSemester: u.admissionSemester ? String(u.admissionSemester) : null,
    admissionCategory: u.admissionCategory ? String(u.admissionCategory) : null,
    isActive: Boolean(u.isActive),
    isTest: Boolean(u.isTest),
    avatar: u.avatar ? String(u.avatar) : null,
    profileLocked: Boolean(u.profileLocked),
    createdAt: u.createdAt ? String(u.createdAt) : new Date().toISOString(),
    appCount,
  };
}

export function UsersManager({
  initialUsers,
  departments,
  programmes,
  courses,
  guides,
  ssoBaseUrl,
  initialPolicy,
  initialAccountDisplayDisabled = false,
}: {
  initialUsers: UserRow[];
  departments: Option[];
  programmes: Option[];
  courses: Option[];
  guides: Option[];
  ssoBaseUrl: string;
  initialPolicy: string[];
  initialAccountDisplayDisabled?: boolean;
}) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [query, setQuery] = useState("");
  const [filterPrimaryRole, setFilterPrimaryRole] = useState("ALL");
  const [filterDepartment, setFilterDepartment] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [modal, setModal] = useState<ModalState>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Profile lock policy (per primary role) + CSV import state + account display.
  const [policy, setPolicy] = useState<string[]>(initialPolicy);
  const [accountDisplayDisabled, setAccountDisplayDisabled] = useState<boolean>(initialAccountDisplayDisabled);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const hasActiveFilters =
    query.trim() !== "" ||
    filterPrimaryRole !== "ALL" ||
    filterDepartment !== "ALL" ||
    filterStatus !== "ALL";

  useEffect(() => {
    setPage(1);
  }, [query, filterPrimaryRole, filterDepartment, filterStatus, pageSize]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = users;

    if (q) {
      list = list.filter((u) => {
        const haystack = [
          u.name,
          u.username,
          u.email,
          u.departmentName ?? "",
          u.rollNo ?? "",
          u.empNo ?? "",
          u.phone ?? "",
          u.designation ?? "",
          u.discipline ?? "",
          u.programmeName ?? "",
          u.courseName ?? "",
          u.guideName ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    if (filterPrimaryRole !== "ALL") {
      list = list.filter((u) => u.primaryRole === filterPrimaryRole);
    }
    if (filterDepartment !== "ALL") {
      list = list.filter((u) => u.departmentId === filterDepartment);
    }
    if (filterStatus !== "ALL") {
      const wantActive = filterStatus === "ACTIVE";
      list = list.filter((u) => u.isActive === wantActive);
    }

    const dir = sortDir;
    const key = sortKey;
    return [...list].sort((a, b) => {
      switch (key) {
        case "name":
          return compareValues(a.name, b.name, dir);
        case "username":
          return compareValues(a.username, b.username, dir);
        case "email":
          return compareValues(a.email, b.email, dir);
        case "primaryRole":
          return (
            compareValues(roleLabel(a.primaryRole), roleLabel(b.primaryRole), dir) ||
            compareValues(a.name, b.name, "asc")
          );
        case "department":
          return (
            compareValues(a.departmentName ?? "", b.departmentName ?? "", dir) ||
            compareValues(a.name, b.name, "asc")
          );
        case "status": {
          const av = a.isActive ? "Active" : "Inactive";
          const bv = b.isActive ? "Active" : "Inactive";
          return compareValues(av, bv, dir) || compareValues(a.name, b.name, "asc");
        }
        case "apps":
          return (
            (a.appCount - b.appCount) * (dir === "asc" ? 1 : -1) ||
            compareValues(a.name, b.name, "asc")
          );
        case "createdAt":
          return (
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
              (dir === "asc" ? 1 : -1) ||
            compareValues(a.name, b.name, "asc")
          );
        default:
          return 0;
      }
    });
  }, [users, query, filterPrimaryRole, filterDepartment, filterStatus, sortKey, sortDir]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const paged = filtered.slice(pageStart, pageStart + pageSize);
  const pageEnd = Math.min(pageStart + pageSize, totalFiltered);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setFilterPrimaryRole("ALL");
    setFilterDepartment("ALL");
    setFilterStatus("ALL");
    setPage(1);
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return <span className="um-sort-ind" aria-hidden="true">↕</span>;
    return (
      <span className="um-sort-ind" aria-hidden="true">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  function ariaSort(key: SortKey): "ascending" | "descending" | "none" {
    if (sortKey !== key) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  const isStaff =
    draft.primaryRole === "STAFF_TEACHING" || draft.primaryRole === "STAFF_NON_TEACHING";
  const isStudentOrScholar =
    draft.primaryRole === "STUDENT" || draft.primaryRole === "SCHOLAR";

  async function api(path: string, method: string, body: unknown) {
    const init: RequestInit = {
      method,
      headers: { "content-type": "application/json" },
    };
    if (method !== "GET" && method !== "HEAD") {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(apiPath(path), init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  function profileBody(includePassword: boolean) {
    const body: Record<string, unknown> = {
      name: draft.name,
      username: draft.username,
      email: draft.email,
      role: draft.role,
      isActive: draft.isActive,
      primaryRole: draft.primaryRole,
      departmentId: draft.departmentId || null,
      designation: draft.designation || null,
      phone: draft.phone || null,
      gender: draft.gender || null,
      phCategory: draft.phCategory || null,
      nonInstituteEmail: draft.nonInstituteEmail || null,
      emergencyPhone: draft.emergencyPhone || null,
    };
    if (includePassword && draft.password) body.password = draft.password;
    if (isStaff) {
      body.employmentType = draft.employmentType || null;
      body.empNo = draft.empNo || null;
      body.rollNo = null;
    } else {
      body.employmentType = null;
      body.empNo = null;
    }
    if (draft.primaryRole === "STUDENT") {
      body.programmeId = draft.programmeId || null;
      body.courseId = draft.courseId || null;
      body.guideId = null;
      body.rollNo = draft.rollNo || null;
    } else if (draft.primaryRole === "SCHOLAR") {
      body.guideId = draft.guideId || null;
      body.programmeId = draft.programmeId || null;
      body.courseId = null;
      body.rollNo = draft.rollNo || null;
    } else {
      body.programmeId = null;
      body.courseId = null;
      body.guideId = null;
      body.rollNo = null;
    }
    return body;
  }

  function replaceRow(updated: Record<string, unknown>, prev: UserRow): UserRow {
    return rowFromUser(updated, prev.appCount);
  }

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setModal({ mode: "add" });
  }

  function openEdit(user: UserRow) {
    setDraft({
      name: user.name,
      username: user.username,
      email: user.email,
      password: "",
      role: user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER",
      isActive: user.isActive,
      primaryRole: user.primaryRole,
      employmentType: user.employmentType ?? "",
      designation: user.designation ?? "",
      phone: user.phone ?? "",
      rollNo: user.rollNo ?? "",
      empNo: user.empNo ?? "",
      gender: user.gender ?? "",
      phCategory: user.phCategory ?? "",
      nonInstituteEmail: user.nonInstituteEmail ?? "",
      emergencyPhone: user.emergencyPhone ?? "",
      departmentId: user.departmentId ?? "",
      programmeId: user.programmeId ?? "",
      courseId: user.courseId ?? "",
      guideId: user.guideId ?? "",
    });
    setModal({ mode: "edit", user });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draft.primaryRole) {
      setError("Select a primary role — every user must be identified with one primary role.");
      return;
    }
    if (!draft.departmentId) {
      setError("Select a department / section — every user belongs to one.");
      return;
    }
    if (!draft.gender) {
      setError("Select a gender — required for every user.");
      return;
    }
    if (!draft.phCategory) {
      setError("Select a PH category — required for every user (use None when not applicable).");
      return;
    }
    if (isStaff && !draft.employmentType) {
      setError("Select an employment type for staff.");
      return;
    }
    if (isStaff && !draft.empNo.trim()) {
      setError("Enter the employee number — required for staff.");
      return;
    }
    if (draft.primaryRole === "STUDENT" && (!draft.programmeId || !draft.courseId)) {
      setError("Select a programme and course for the student.");
      return;
    }
    if (isStudentOrScholar && !draft.rollNo.trim()) {
      setError("Enter the roll number — required for students and scholars.");
      return;
    }
    if (draft.primaryRole === "SCHOLAR" && !draft.guideId) {
      setError("Select a guide for the scholar.");
      return;
    }
    if (draft.nonInstituteEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.nonInstituteEmail.trim())) {
      setError("Non-institute email is not a valid address (or leave it blank).");
      return;
    }

    setBusy(true);
    try {
      if (modal?.mode === "add") {
        const data = await api("/api/users", "POST", {
          ...profileBody(true),
          password: draft.password,
        });
        const created = rowFromUser(data.user as Record<string, unknown>, 0);
        setUsers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setNotice(`User "${created.username}" created.`);
      } else if (modal?.mode === "edit") {
        const data = await api("/api/users", "PATCH", {
          id: modal.user.id,
          ...profileBody(false),
        });
        const updated = data.user as Record<string, unknown>;
        setUsers((prev) =>
          prev
            .map((u) => (u.id === updated.id ? replaceRow(updated, u) : u))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setNotice(`User "${String(updated.username)}" updated.`);
      }
      setModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(user: UserRow) {
    setBusy(true);
    setError(null);
    try {
      const data = await api("/api/users", "PATCH", {
        id: user.id,
        isActive: !user.isActive,
      });
      const updated = data.user as Record<string, unknown>;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? replaceRow(updated, u) : u)));
      setNotice(`User "${String(updated.username)}" ${updated.isActive ? "activated" : "deactivated"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleLock(user: UserRow) {
    setBusy(true);
    setError(null);
    try {
      const data = await api("/api/users", "PATCH", {
        id: user.id,
        profileLocked: !user.profileLocked,
      });
      const updated = data.user as Record<string, unknown>;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? replaceRow(updated, u) : u)));
      setNotice(
        `Profile editing ${updated.profileLocked ? "locked" : "unlocked"} for "${String(updated.username)}".`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(user: UserRow) {
    if (!confirm(`Delete user "${user.username}"?\nThis also revokes all their application access.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/users", "DELETE", { id: user.id });
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setNotice(`User "${user.username}" deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function togglePolicyRole(value: string) {
    const next = policy.includes(value)
      ? policy.filter((r) => r !== value)
      : [...policy, value];
    setPolicyBusy(true);
    setError(null);
    try {
      const data = await api("/api/profile-policy", "PATCH", { locked: next });
      setPolicy(data.locked ?? next);
      setNotice("Profile lock policy updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPolicyBusy(false);
    }
  }

  async function toggleAccountDisplay(disabled: boolean) {
    setPolicyBusy(true);
    setError(null);
    try {
      const data = await api("/api/profile-policy", "PATCH", { accountDisplayDisabled: disabled });
      setAccountDisplayDisabled(Boolean(data.accountDisplayDisabled));
      setNotice(`Account display & access for regular users ${disabled ? "disabled" : "enabled"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPolicyBusy(false);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportBusy(true);
    setImportResult(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(apiPath("/api/users/import"), { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setImportResult(data as ImportResult);

      // Refresh the user list so newly imported users appear immediately.
      const listRes = await fetch(apiPath("/api/users"), { cache: "no-store" });
      if (listRes.ok) {
        const list = await listRes.json();
        if (Array.isArray(list.users))
          setUsers(
            list.users.map((u: unknown) => {
              const r = u as Record<string, unknown>;
              return rowFromUser(r, Number(r.appCount ?? 0));
            })
          );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportBusy(false);
    }
  }

  function profileDetail(u: UserRow) {
    if (u.primaryRole === "STUDENT") {
      return [u.rollNo ? `Roll ${u.rollNo}` : "", u.programmeName, u.courseName]
        .filter(Boolean)
        .join(" · ");
    }
    if (u.primaryRole === "SCHOLAR") {
      return [
        u.rollNo ? `Roll ${u.rollNo}` : "",
        u.discipline ?? "",
        u.admissionYear ? `${u.admissionYear}${u.admissionSemester ? " " + u.admissionSemester : ""}` : "",
        u.admissionCategory ?? "",
        u.natureOfAdmission ?? "",
        u.guideName ? `Guide: ${u.guideName}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    if (u.primaryRole === "STAFF_TEACHING" || u.primaryRole === "STAFF_NON_TEACHING") {
      return [
        u.empNo ? `Emp ${u.empNo}` : "",
        u.designation,
        u.employmentType ? `(${u.employmentType.replace(/_/g, " ").toLowerCase()})` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
    return "";
  }

  return (
    <div>
      {error && <div className="iipe-alert danger">{error}</div>}
      {notice && (
        <div className="iipe-alert success">
          {notice}
          <button
            type="button"
            onClick={() => setNotice(null)}
            style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Bulk import + profile lock policy */}
      <div className="iipe-grid iipe-grid-2" style={{ marginBottom: 18 }}>
        <div className="iipe-card" style={{ marginBottom: 0 }}>
          <h3 style={{ marginTop: 0 }}>Bulk import users (CSV)</h3>
          <p className="iipe-muted" style={{ marginTop: 0 }}>
            Upload students, scholars or any primary role in one go. Download the
            template, fill it in, and upload — rows that fail validation are
            reported without blocking the rest.
          </p>
          <div className="iipe-row" style={{ gap: 8 }}>
            <a className="iipe-btn secondary" href={apiPath("/api/users/csv-template")} download>
              Download template
            </a>
            <button
              className="iipe-btn secondary"
              type="button"
              onClick={() => exportUsersXlsx(filtered, hasActiveFilters)}
              disabled={filtered.length === 0}
            >
              Export XLSX
            </button>
            <label
              className="iipe-btn"
              style={{ cursor: "pointer", margin: 0 }}
            >
              {importBusy ? "Importing…" : "Choose CSV file"}
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                disabled={importBusy}
                onChange={(e) => void handleImportFile(e)}
              />
            </label>
          </div>
          {importResult && (
            <div style={{ marginTop: 12 }}>
              <div
                className={`iipe-alert ${importResult.failed === 0 ? "success" : ""}`}
                style={{ marginBottom: 8 }}
              >
                {importResult.created} user(s) created, {importResult.failed} row(s)
                failed.
              </div>
              {importResult.errors.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.85rem" }}>
                  {importResult.errors.map((err, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      Line {err.row} <code>{err.username}</code>: {err.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="iipe-card" style={{ marginBottom: 0 }}>
          <h3 style={{ marginTop: 0 }}>Account & Profile Policy</h3>
          <p className="iipe-muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
            Control user profile editing and account page access across all applications.
          </p>

          <div style={{ padding: "10px 12px", background: "var(--iipe-muted-bg, rgba(0,0,0,0.03))", borderRadius: 8, marginBottom: 14, border: "1px solid var(--iipe-border, #e2e8f0)" }}>
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.9rem",
              }}
            >
              <input
                type="checkbox"
                checked={accountDisplayDisabled}
                disabled={policyBusy}
                onChange={(e) => void toggleAccountDisplay(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2 }}
              />
              <div>
                <div>Disable My Account access & display for regular users</div>
                <div className="iipe-muted" style={{ fontWeight: 400, fontSize: "0.82rem", marginTop: 2 }}>
                  When enabled, regular users will not see &quot;My Account&quot; in profile dropdowns or sidebars, and direct visits to <code>/sso/account</code> are blocked. Super Admins retain full access.
                </div>
              </div>
            </label>
          </div>

          <h4 style={{ margin: "8px 0 4px", fontSize: "0.9rem" }}>Lock profile editing by role</h4>
          <p className="iipe-muted" style={{ marginTop: 0, fontSize: "0.82rem" }}>
            Users of a locked role cannot change their own name/email/avatar in My Account. Individual users can also be locked from the table below.
          </p>
          {PRIMARY_ROLES.map((r) => (
            <label
              key={r.value}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                padding: "3px 0",
                cursor: "pointer",
                fontSize: "0.88rem",
              }}
            >
              <input
                type="checkbox"
                checked={policy.includes(r.value)}
                disabled={policyBusy}
                onChange={() => void togglePolicyRole(r.value)}
                style={{ width: 16, height: 16 }}
              />
              {r.label}
            </label>
          ))}
          <div className="iipe-muted" style={{ marginTop: 8, fontSize: "0.82rem" }}>
            {policy.length === 0
              ? "No roles locked — users with account access can edit their own profile."
              : `Locked: ${policy.map((r) => r.replace(/_/g, " ").toLowerCase()).join(", ")}.`}
          </div>
        </div>
      </div>

      <div className="um-toolbar">
        <input
          type="search"
          className="iipe-input"
          placeholder="Search name, username, email, roll/emp no…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search users"
        />
        <select
          className="iipe-select"
          aria-label="Filter by primary role"
          value={filterPrimaryRole}
          onChange={(e) => setFilterPrimaryRole(e.target.value)}
        >
          <option value="ALL">All roles</option>
          {PRIMARY_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          className="iipe-select"
          aria-label="Filter by department"
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
        >
          <option value="ALL">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          className="iipe-select"
          aria-label="Filter by status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active only</option>
          <option value="INACTIVE">Inactive only</option>
        </select>
        <div className="um-toolbar-actions">
          {hasActiveFilters && (
            <button className="iipe-btn secondary" type="button" onClick={clearFilters}>
              Clear filters
            </button>
          )}
          <button className="iipe-btn" type="button" onClick={openAdd} disabled={busy}>
            ＋ Add user
          </button>
        </div>
      </div>

      <div className="um-meta" style={{ marginBottom: 8 }}>
        {totalFiltered === users.length
          ? `${users.length} user${users.length === 1 ? "" : "s"}`
          : `${totalFiltered} of ${users.length} user${users.length === 1 ? "" : "s"}`}
        {sortKey ? ` · sorted by ${sortKey === "apps" ? "apps" : sortKey} (${sortDir})` : ""}
      </div>

      <div className="iipe-table-scroll">
        <table className="iipe-table">
          <thead>
            <tr>
              <th aria-sort={ariaSort("name")}>
                <button type="button" className="um-th-sort" onClick={() => toggleSort("name")}>
                  User {sortIndicator("name")}
                </button>
              </th>
              <th aria-sort={ariaSort("email")}>
                <button type="button" className="um-th-sort" onClick={() => toggleSort("email")}>
                  Email {sortIndicator("email")}
                </button>
              </th>
              <th aria-sort={ariaSort("primaryRole")}>
                <button type="button" className="um-th-sort" onClick={() => toggleSort("primaryRole")}>
                  Profile {sortIndicator("primaryRole")}
                </button>
              </th>
              <th>Platform Role</th>
              <th aria-sort={ariaSort("status")}>
                <button type="button" className="um-th-sort" onClick={() => toggleSort("status")}>
                  Status {sortIndicator("status")}
                </button>
              </th>
              <th style={{ textAlign: "center" }} aria-sort={ariaSort("apps")}>
                <button type="button" className="um-th-sort" onClick={() => toggleSort("apps")}>
                  Apps {sortIndicator("apps")}
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="iipe-row" style={{ gap: 10, flexWrap: "nowrap" }}>
                    {u.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${ssoBaseUrl}${u.avatar}`}
                        alt=""
                        width={30}
                        height={30}
                        style={{
                          borderRadius: "50%",
                          objectFit: "cover",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          background: "var(--iipe-primary-light)",
                          color: "var(--iipe-primary)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "0.72rem",
                          flexShrink: 0,
                        }}
                      >
                        {initials(u.name) || "?"}
                      </span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <strong>
                        {u.name}{" "}
                        {u.isTest && (
                          <span className="iipe-badge" title="Seed / demo account (not from the employee master list)">
                            Test
                          </span>
                        )}
                        {u.profileLocked && (
                          <span className="iipe-badge danger" title="Profile editing locked">
                            Locked
                          </span>
                        )}
                      </strong>
                      <div className="iipe-muted">@{u.username}</div>
                    </div>
                  </div>
                </td>
                <td>{u.email ?? "—"}</td>
                <td>
                  <span className="iipe-badge accent">{u.primaryRole.replace(/_/g, " ")}</span>
                  <div className="iipe-muted" style={{ marginTop: 2 }}>
                    {u.departmentName ?? "No department"}
                    {profileDetail(u) ? ` · ${profileDetail(u)}` : ""}
                  </div>
                </td>
                <td>
                  {u.role === "SUPER_ADMIN" ? (
                    <span className="iipe-badge">Super Admin</span>
                  ) : (
                    <span className="iipe-badge">User</span>
                  )}
                </td>
                <td>
                  {u.isActive ? (
                    <span className="iipe-badge">Active</span>
                  ) : (
                    <span className="iipe-badge danger">Inactive</span>
                  )}
                </td>
                <td style={{ textAlign: "center" }}>
                  <a href={`/admin-console/app-matrix?user=${encodeURIComponent(u.username)}`} title="Manage app access">
                    {u.appCount}
                  </a>
                </td>
                <td>
                  <div className="iipe-row" style={{ gap: 6 }}>
                    <button className="iipe-btn secondary" type="button" onClick={() => openEdit(u)} disabled={busy}>
                      Edit
                    </button>
                    <button className="iipe-btn secondary" type="button" onClick={() => toggleActive(u)} disabled={busy}>
                      {u.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      className="iipe-btn secondary"
                      type="button"
                      onClick={() => toggleLock(u)}
                      disabled={busy}
                      title="Lock or unlock this user's ability to edit their own profile"
                    >
                      {u.profileLocked ? "Unlock profile" : "Lock profile"}
                    </button>
                    <button className="iipe-btn danger" type="button" onClick={() => remove(u)} disabled={busy}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className="iipe-muted">
                  {users.length === 0
                    ? "No users found."
                    : hasActiveFilters
                      ? "No users match your search or filters."
                      : "No users match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalFiltered > 0 && (
        <nav className="um-pager" aria-label="Users table pagination">
          <span className="um-meta">
            Showing {pageStart + 1}–{pageEnd} of {totalFiltered}
          </span>
          <span className="iipe-spacer" />
          <label className="um-meta" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Rows
            <select
              className="iipe-select um-page-size"
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="um-pager-pages">
            <button
              type="button"
              className="um-page-btn"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label="Previous page"
            >
              ‹ Prev
            </button>
            {pageWindow(currentPage, totalPages).map((item, idx) =>
              item === "gap" ? (
                <span key={`gap-${idx}`} className="um-page-ellipsis" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`um-page-btn${item === currentPage ? " active" : ""}`}
                  onClick={() => setPage(item)}
                  aria-label={`Page ${item}`}
                  aria-current={item === currentPage ? "page" : undefined}
                >
                  {item}
                </button>
              )
            )}
            <button
              type="button"
              className="um-page-btn"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
            >
              Next ›
            </button>
          </div>
        </nav>
      )}

      {modal && (
        <div className="iipe-modal-overlay" onClick={() => !busy && setModal(null)}>
          <form className="iipe-modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
            <div className="iipe-row" style={{ marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>
                {modal.mode === "add" ? "Add user" : `Edit ${modal.user.name}`}
              </h2>
              <span className="iipe-spacer" />
              <button
                type="button"
                className="iipe-btn ghost"
                onClick={() => setModal(null)}
                disabled={busy}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="iipe-field">
              <label className="iipe-label" htmlFor="um-name">Full name</label>
              <input
                id="um-name"
                className="iipe-input"
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="iipe-row" style={{ gap: 12 }}>
              <div className="iipe-field" style={{ flex: 1 }}>
                <label className="iipe-label" htmlFor="um-username">Username</label>
                <input
                  id="um-username"
                  className="iipe-input"
                  required
                  value={draft.username}
                  onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                />
              </div>
              <div className="iipe-field" style={{ flex: 1 }}>
                <label className="iipe-label" htmlFor="um-email">Email</label>
                <input
                  id="um-email"
                  className="iipe-input"
                  type="email"
                  required
                  placeholder="may be shared with other users"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                />
              </div>
            </div>
            <div className="iipe-field">
              <label className="iipe-label" htmlFor="um-password">
                {modal.mode === "add" ? "Password" : "New password (leave blank to keep)"}
              </label>
              <input
                id="um-password"
                className="iipe-input"
                type="password"
                required={modal.mode === "add"}
                minLength={modal.mode === "add" ? 6 : undefined}
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              />
            </div>

            <div className="iipe-field">
              <label className="iipe-label" htmlFor="um-primary-role">
                Primary role <span className="iipe-muted">(required — every user has one)</span>
              </label>
              <select
                id="um-primary-role"
                className="iipe-select"
                required
                value={draft.primaryRole}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    primaryRole: e.target.value,
                    employmentType: "",
                    programmeId: "",
                    courseId: "",
                    guideId: "",
                  })
                }
              >
                <option value="">— Select primary role —</option>
                {PRIMARY_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="iipe-field">
              <label className="iipe-label" htmlFor="um-department">
                Department / Section <span className="iipe-muted">(required)</span>
              </label>
              <select
                id="um-department"
                className="iipe-select"
                required
                value={draft.departmentId}
                onChange={(e) => setDraft({ ...draft, departmentId: e.target.value })}
              >
                <option value="">— Select department —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Required for the chosen role: employee number for staff, roll number for students/scholars */}
            {isStaff && (
              <div className="iipe-row" style={{ gap: 12 }}>
                <div className="iipe-field" style={{ flex: 1 }}>
                  <label className="iipe-label" htmlFor="um-emp-no">
                    Employee number <span className="iipe-muted">(required)</span>
                  </label>
                  <input
                    id="um-emp-no"
                    className="iipe-input"
                    required
                    placeholder="e.g. IPE-T-001"
                    value={draft.empNo}
                    onChange={(e) => setDraft({ ...draft, empNo: e.target.value })}
                  />
                </div>
                <div className="iipe-field" style={{ flex: 1 }}>
                  <label className="iipe-label" htmlFor="um-emp-type">
                    Employment type <span className="iipe-muted">(required)</span>
                  </label>
                  <select
                    id="um-emp-type"
                    className="iipe-select"
                    required
                    value={draft.employmentType}
                    onChange={(e) => setDraft({ ...draft, employmentType: e.target.value })}
                  >
                    <option value="">— Select employment type —</option>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {isStudentOrScholar && (
              <div className="iipe-field">
                <label className="iipe-label" htmlFor="um-roll-no">
                  Roll number <span className="iipe-muted">(required for students &amp; scholars)</span>
                </label>
                <input
                  id="um-roll-no"
                  className="iipe-input"
                  required
                  placeholder="e.g. 21PE3012"
                  value={draft.rollNo}
                  onChange={(e) => setDraft({ ...draft, rollNo: e.target.value })}
                />
              </div>
            )}

            <div className="iipe-row" style={{ gap: 12 }}>
              <div className="iipe-field" style={{ flex: 1 }}>
                <label className="iipe-label" htmlFor="um-gender">
                  Gender <span className="iipe-muted">(required)</span>
                </label>
                <select
                  id="um-gender"
                  className="iipe-select"
                  required
                  value={draft.gender}
                  onChange={(e) => setDraft({ ...draft, gender: e.target.value })}
                >
                  <option value="">— Select gender —</option>
                  {GENDERS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="iipe-field" style={{ flex: 1 }}>
                <label className="iipe-label" htmlFor="um-ph-cat">
                  PH category <span className="iipe-muted">(required)</span>
                </label>
                <select
                  id="um-ph-cat"
                  className="iipe-select"
                  required
                  value={draft.phCategory}
                  onChange={(e) => setDraft({ ...draft, phCategory: e.target.value })}
                >
                  <option value="">— Select category —</option>
                  {PH_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isStaff && (
              <div className="iipe-field">
                <label className="iipe-label" htmlFor="um-designation">Designation</label>
                <input
                  id="um-designation"
                  className="iipe-input"
                  value={draft.designation}
                  onChange={(e) => setDraft({ ...draft, designation: e.target.value })}
                />
              </div>
            )}

            {draft.primaryRole === "STUDENT" && (
              <div className="iipe-row" style={{ gap: 12 }}>
                <div className="iipe-field" style={{ flex: 1 }}>
                  <label className="iipe-label" htmlFor="um-programme">
                    Programme <span className="iipe-muted">(required)</span>
                  </label>
                  <select
                    id="um-programme"
                    className="iipe-select"
                    required
                    value={draft.programmeId}
                    onChange={(e) => setDraft({ ...draft, programmeId: e.target.value })}
                  >
                    <option value="">— Select programme —</option>
                    {programmes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="iipe-field" style={{ flex: 1 }}>
                  <label className="iipe-label" htmlFor="um-course">
                    Course <span className="iipe-muted">(required)</span>
                  </label>
                  <select
                    id="um-course"
                    className="iipe-select"
                    required
                    value={draft.courseId}
                    onChange={(e) => setDraft({ ...draft, courseId: e.target.value })}
                  >
                    <option value="">— Select course —</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {draft.primaryRole === "SCHOLAR" && (
              <div className="iipe-field">
                <label className="iipe-label" htmlFor="um-guide">
                  Guide <span className="iipe-muted">(required — staff teaching)</span>
                </label>
                <select
                  id="um-guide"
                  className="iipe-select"
                  required
                  value={draft.guideId}
                  onChange={(e) => setDraft({ ...draft, guideId: e.target.value })}
                >
                  <option value="">— Select guide —</option>
                  {guides.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="iipe-row" style={{ gap: 12 }}>
              <div className="iipe-field" style={{ flex: 1 }}>
                <label className="iipe-label" htmlFor="um-phone">Phone</label>
                <input
                  id="um-phone"
                  className="iipe-input"
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </div>
              <div className="iipe-field" style={{ flex: 1 }}>
                <label className="iipe-label" htmlFor="um-emergency">Emergency phone</label>
                <input
                  id="um-emergency"
                  className="iipe-input"
                  value={draft.emergencyPhone}
                  onChange={(e) => setDraft({ ...draft, emergencyPhone: e.target.value })}
                  placeholder="optional"
                />
              </div>
            </div>
            <div className="iipe-field">
              <label className="iipe-label" htmlFor="um-noninst">
                Non-institute email
              </label>
              <input
                id="um-noninst"
                className="iipe-input"
                type="email"
                value={draft.nonInstituteEmail}
                onChange={(e) => setDraft({ ...draft, nonInstituteEmail: e.target.value })}
                placeholder="personal / alternate email (optional)"
              />
            </div>

            <div className="iipe-row" style={{ alignItems: "flex-end" }}>
              <div className="iipe-field" style={{ flex: 1 }}>
                <label className="iipe-label" htmlFor="um-role">Platform role</label>
                <select
                  id="um-role"
                  className="iipe-select"
                  value={draft.role}
                  onChange={(e) => setDraft({ ...draft, role: e.target.value as Draft["role"] })}
                >
                  <option value="USER">User</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              </div>
              <label
                className="iipe-label"
                style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", paddingBottom: 10 }}
              >
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                  style={{ width: 17, height: 17 }}
                />
                Active
              </label>
            </div>

            <div className="iipe-form-actions">
              <button className="iipe-btn" type="submit" disabled={busy}>
                {busy ? "Saving…" : modal.mode === "add" ? "Create user" : "Save changes"}
              </button>
              <button className="iipe-btn secondary" type="button" onClick={() => setModal(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
