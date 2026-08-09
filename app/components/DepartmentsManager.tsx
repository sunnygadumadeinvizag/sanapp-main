"use client";

import { useMemo, useState } from "react";

export type DepartmentRow = {
  id: string;
  name: string;
  headId: string | null;
  headName: string | null;
  headUsername: string | null;
  memberCount: number;
};

export type HodOption = { id: string; name: string; username: string };

type ModalState =
  | { mode: "add" }
  | { mode: "edit"; department: DepartmentRow }
  | null;

export function DepartmentsManager({
  initialDepartments,
  hodOptions,
}: {
  initialDepartments: DepartmentRow[];
  hodOptions: HodOption[];
}) {
  const [departments, setDepartments] = useState<DepartmentRow[]>(initialDepartments);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [name, setName] = useState("");
  const [headId, setHeadId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter(
      (d) => d.name.toLowerCase().includes(q) || (d.headName ?? "").toLowerCase().includes(q)
    );
  }, [departments, query]);

  async function api(path: string, method: string, body: unknown) {
    const init: RequestInit = {
      method,
      headers: { "content-type": "application/json" },
    };
    if (method !== "GET" && method !== "HEAD") {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  function openAdd() {
    setName("");
    setHeadId("");
    setModal({ mode: "add" });
  }

  function openEdit(d: DepartmentRow) {
    setName(d.name);
    setHeadId(d.headId ?? "");
    setModal({ mode: "edit", department: d });
  }

  async function refresh() {
    const data = await api("/api/departments", "GET", {});
    const rows: Array<{
      id: string;
      name: string;
      headId: string | null;
      head: { name: string; username: string } | null;
      _count: { users: number };
    }> = data.departments ?? [];
    setDepartments(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        headId: r.headId,
        headName: r.head?.name ?? null,
        headUsername: r.head?.username ?? null,
        memberCount: r._count.users,
      }))
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (modal?.mode === "add") {
        await api("/api/departments", "POST", { name, headId: headId || null });
        setNotice(`Department "${name}" created.`);
      } else if (modal?.mode === "edit") {
        await api("/api/departments", "PATCH", {
          id: modal.department.id,
          name,
          headId: headId || null,
        });
        setNotice(`Department "${name}" updated.`);
      }
      setModal(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: DepartmentRow) {
    if (!confirm(`Delete department "${d.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/departments", "DELETE", { id: d.id });
      setDepartments((prev) => prev.filter((x) => x.id !== d.id));
      setNotice(`Department "${d.name}" deleted.`);
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
          placeholder="Search departments…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search departments"
        />
        <span className="iipe-spacer" />
        <button className="iipe-btn" type="button" onClick={openAdd} disabled={busy}>
          ＋ Add department
        </button>
      </div>

      <div className="iipe-table-scroll">
        <table className="iipe-table">
          <thead>
            <tr>
              <th>Department / Section</th>
              <th>Head of Department</th>
              <th style={{ textAlign: "center" }}>Members</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => (
              <tr key={d.id}>
                <td>
                  <strong>{d.name}</strong>
                </td>
                <td>
                  {d.headName ? (
                    <>
                      {d.headName}{" "}
                      <span className="iipe-muted">(@{d.headUsername})</span>
                    </>
                  ) : (
                    <span className="iipe-muted">— No HOD assigned —</span>
                  )}
                </td>
                <td style={{ textAlign: "center" }}>{d.memberCount}</td>
                <td>
                  <div className="iipe-row" style={{ gap: 6 }}>
                    <button className="iipe-btn secondary" type="button" onClick={() => openEdit(d)} disabled={busy}>
                      Edit
                    </button>
                    <button className="iipe-btn danger" type="button" onClick={() => remove(d)} disabled={busy}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="iipe-muted">
                  {departments.length === 0 ? "No departments yet." : "No departments match your search."}
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
                {modal.mode === "add" ? "Add department" : `Edit ${modal.department.name}`}
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
              <label className="iipe-label" htmlFor="dm-name">
                Department / Section name
              </label>
              <input
                id="dm-name"
                className="iipe-input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="iipe-field">
              <label className="iipe-label" htmlFor="dm-head">
                Head of Department (optional)
              </label>
              <select
                id="dm-head"
                className="iipe-select"
                value={headId}
                onChange={(e) => setHeadId(e.target.value)}
              >
                <option value="">— No HOD —</option>
                {hodOptions.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} (@{h.username})
                  </option>
                ))}
              </select>
            </div>

            <div className="iipe-form-actions">
              <button className="iipe-btn" type="submit" disabled={busy}>
                {busy ? "Saving…" : modal.mode === "add" ? "Create department" : "Save changes"}
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
