"use client";

import { useMemo, useState } from "react";

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
  departmentId: string | null;
  departmentName: string | null;
  programmeId: string | null;
  programmeName: string | null;
  courseId: string | null;
  courseName: string | null;
  guideId: string | null;
  guideName: string | null;
  isActive: boolean;
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
  departmentId: string;
  programmeId: string;
  courseId: string;
  guideId: string;
};

type ModalState = { mode: "add" } | { mode: "edit"; user: UserRow } | null;

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
  departmentId: "",
  programmeId: "",
  courseId: "",
  guideId: "",
};

export function UsersManager({
  initialUsers,
  departments,
  programmes,
  courses,
  guides,
}: {
  initialUsers: UserRow[];
  departments: Option[];
  programmes: Option[];
  courses: Option[];
  guides: Option[];
}) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.departmentName ?? "").toLowerCase().includes(q)
    );
  }, [users, query]);

  const isStaff =
    draft.primaryRole === "STAFF_TEACHING" || draft.primaryRole === "STAFF_NON_TEACHING";

  async function api(path: string, method: string, body: unknown) {
    const res = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
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
    };
    if (includePassword && draft.password) body.password = draft.password;
    if (isStaff) {
      body.employmentType = draft.employmentType || null;
    } else {
      body.employmentType = null;
    }
    if (draft.primaryRole === "STUDENT") {
      body.programmeId = draft.programmeId || null;
      body.courseId = draft.courseId || null;
      body.guideId = null;
    } else if (draft.primaryRole === "SCHOLAR") {
      body.guideId = draft.guideId || null;
      body.programmeId = draft.programmeId || null;
      body.courseId = null;
    } else {
      body.programmeId = null;
      body.courseId = null;
      body.guideId = null;
    }
    return body;
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
    if (isStaff && !draft.employmentType) {
      setError("Select an employment type for staff.");
      return;
    }
    if (draft.primaryRole === "STUDENT" && (!draft.programmeId || !draft.courseId)) {
      setError("Select a programme and course for the student.");
      return;
    }
    if (draft.primaryRole === "SCHOLAR" && !draft.guideId) {
      setError("Select a guide for the scholar.");
      return;
    }

    setBusy(true);
    try {
      if (modal?.mode === "add") {
        const data = await api("/api/users", "POST", {
          ...profileBody(true),
          password: draft.password,
        });
        const created: UserRow = data.user;
        setUsers((prev) => [...prev, { ...created, appCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
        setNotice(`User "${created.username}" created.`);
      } else if (modal?.mode === "edit") {
        const data = await api("/api/users", "PATCH", {
          id: modal.user.id,
          ...profileBody(false),
        });
        const updated: UserRow = data.user;
        setUsers((prev) =>
          prev
            .map((u) => (u.id === updated.id ? { ...updated, appCount: u.appCount } : u))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setNotice(`User "${updated.username}" updated.`);
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
      const updated: UserRow = data.user;
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...updated, appCount: u.appCount } : u)));
      setNotice(`User "${updated.username}" ${updated.isActive ? "activated" : "deactivated"}.`);
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

  function profileDetail(u: UserRow) {
    if (u.primaryRole === "STUDENT") {
      return [u.programmeName, u.courseName].filter(Boolean).join(" · ");
    }
    if (u.primaryRole === "SCHOLAR") {
      return u.guideName ? `Guide: ${u.guideName}` : "";
    }
    if (u.primaryRole === "STAFF_TEACHING" || u.primaryRole === "STAFF_NON_TEACHING") {
      return [
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

      <div className="iipe-row" style={{ marginBottom: 14 }}>
        <input
          className="iipe-input"
          style={{ maxWidth: 320 }}
          placeholder="Search name, username, email or department…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search users"
        />
        <span className="iipe-spacer" />
        <button className="iipe-btn" type="button" onClick={openAdd} disabled={busy}>
          ＋ Add user
        </button>
      </div>

      <div className="iipe-table-scroll">
        <table className="iipe-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Profile</th>
              <th>Platform Role</th>
              <th>Status</th>
              <th style={{ textAlign: "center" }}>Apps</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <div className="iipe-muted">@{u.username}</div>
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
                  <a href={`/?user=${encodeURIComponent(u.username)}`} title="Manage app access">
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
                    <button className="iipe-btn danger" type="button" onClick={() => remove(u)} disabled={busy}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="iipe-muted">
                  {users.length === 0 ? "No users found." : "No users match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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

            {isStaff && (
              <div className="iipe-row" style={{ gap: 12 }}>
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
                <div className="iipe-field" style={{ flex: 1 }}>
                  <label className="iipe-label" htmlFor="um-designation">Designation</label>
                  <input
                    id="um-designation"
                    className="iipe-input"
                    value={draft.designation}
                    onChange={(e) => setDraft({ ...draft, designation: e.target.value })}
                  />
                </div>
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

            <div className="iipe-field">
              <label className="iipe-label" htmlFor="um-phone">Phone</label>
              <input
                id="um-phone"
                className="iipe-input"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
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
