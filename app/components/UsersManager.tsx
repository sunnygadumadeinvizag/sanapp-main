"use client";

import { useMemo, useState } from "react";

export type UserRow = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  appCount: number;
};

type Draft = {
  name: string;
  username: string;
  email: string;
  password: string;
  role: "USER" | "SUPER_ADMIN";
  isActive: boolean;
};

type ModalState = { mode: "add" } | { mode: "edit"; user: UserRow } | null;

const EMPTY_DRAFT: Draft = {
  name: "",
  username: "",
  email: "",
  password: "",
  role: "USER",
  isActive: true,
};

export function UsersManager({ initialUsers }: { initialUsers: UserRow[] }) {
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
        u.email.toLowerCase().includes(q)
    );
  }, [users, query]);

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
    });
    setModal({ mode: "edit", user });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (modal?.mode === "add") {
        const data = await api("/api/users", "POST", {
          name: draft.name,
          username: draft.username,
          email: draft.email,
          password: draft.password,
          role: draft.role,
          isActive: draft.isActive,
        });
        const created: UserRow = data.user;
        setUsers((prev) => [...prev, { ...created, appCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
        setNotice(`User "${created.username}" created.`);
      } else if (modal?.mode === "edit") {
        const body: Record<string, unknown> = {
          id: modal.user.id,
          name: draft.name,
          username: draft.username,
          email: draft.email,
          role: draft.role,
          isActive: draft.isActive,
        };
        if (draft.password) body.password = draft.password;
        const data = await api("/api/users", "PATCH", body);
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
          placeholder="Search name, username or email…"
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
              <th>Role</th>
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
                <td>{u.email}</td>
                <td>
                  {u.role === "SUPER_ADMIN" ? (
                    <span className="iipe-badge accent">Super Admin</span>
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
                  <a href={`/?user=${encodeURIComponent(u.username)}`} title="Manage app access">{u.appCount}</a>
                </td>
                <td>
                  <div className="iipe-row" style={{ gap: 6 }}>
                    <button className="iipe-btn secondary" type="button" onClick={() => openEdit(u)} disabled={busy}>
                      Edit
                    </button>
                    <button
                      className="iipe-btn secondary"
                      type="button"
                      onClick={() => toggleActive(u)}
                      disabled={busy}
                    >
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
                <td colSpan={6} className="iipe-muted">
                  {users.length === 0 ? "No users found." : "No users match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="iipe-modal-overlay" onClick={() => !busy && setModal(null)}>
          <form
            className="iipe-modal"
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
          >
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
            <div className="iipe-field">
              <label className="iipe-label" htmlFor="um-username">Username</label>
              <input
                id="um-username"
                className="iipe-input"
                required
                value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
              />
            </div>
            <div className="iipe-field">
              <label className="iipe-label" htmlFor="um-email">Email</label>
              <input
                id="um-email"
                className="iipe-input"
                type="email"
                required
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
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
            <div className="iipe-row" style={{ alignItems: "flex-end" }}>
              <div className="iipe-field" style={{ flex: 1 }}>
                <label className="iipe-label" htmlFor="um-role">Role</label>
                <select
                  id="um-role"
                  className="iipe-select"
                  value={draft.role}
                  onChange={(e) =>
                    setDraft({ ...draft, role: e.target.value as Draft["role"] })
                  }
                >
                  <option value="USER">User</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
              </div>
              <label className="iipe-label" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", paddingBottom: 10 }}>
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
