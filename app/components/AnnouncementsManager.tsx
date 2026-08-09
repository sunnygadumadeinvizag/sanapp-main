"use client";

import { useMemo, useState } from "react";

export type AnnouncementRow = {
  id: string;
  type: "UPDATE" | "ALERT";
  title: string;
  body: string;
  published: boolean;
  createdAt: string;
};

type ModalState =
  | { mode: "add" }
  | { mode: "edit"; announcement: AnnouncementRow }
  | null;

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AnnouncementsManager({
  initialAnnouncements,
}: {
  initialAnnouncements: AnnouncementRow[];
}) {
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>(
    initialAnnouncements
  );
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [type, setType] = useState<"UPDATE" | "ALERT">("UPDATE");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return announcements;
    return announcements.filter(
      (a) =>
        a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)
    );
  }, [announcements, query]);

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
    setType("UPDATE");
    setTitle("");
    setBody("");
    setPublished(true);
    setModal({ mode: "add" });
  }

  function openEdit(a: AnnouncementRow) {
    setType(a.type);
    setTitle(a.title);
    setBody(a.body);
    setPublished(a.published);
    setModal({ mode: "edit", announcement: a });
  }

  async function refresh() {
    const data = await api("/api/announcements", "GET", {});
    const rows: Array<{
      id: string;
      type: "UPDATE" | "ALERT";
      title: string;
      body: string;
      published: boolean;
      createdAt: string;
    }> = data.announcements ?? [];
    setAnnouncements(rows);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (modal?.mode === "add") {
        await api("/api/announcements", "POST", { type, title, body, published });
        setNotice(`Announcement "${title}" created.`);
      } else if (modal?.mode === "edit") {
        await api("/api/announcements", "PATCH", {
          id: modal.announcement.id,
          type,
          title,
          body,
          published,
        });
        setNotice(`Announcement "${title}" updated.`);
      }
      setModal(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(a: AnnouncementRow) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/announcements", "PATCH", {
        id: a.id,
        published: !a.published,
      });
      setAnnouncements((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, published: !x.published } : x))
      );
      setNotice(a.published ? `"${a.title}" hidden.` : `"${a.title}" published.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: AnnouncementRow) {
    if (!confirm(`Delete announcement "${a.title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/announcements", "DELETE", { id: a.id });
      setAnnouncements((prev) => prev.filter((x) => x.id !== a.id));
      setNotice(`Announcement "${a.title}" deleted.`);
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
          placeholder="Search announcements…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search announcements"
        />
        <span className="iipe-spacer" />
        <button className="iipe-btn" type="button" onClick={openAdd} disabled={busy}>
          ＋ Add announcement
        </button>
      </div>

      <div className="iipe-table-scroll">
        <table className="iipe-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Title</th>
              <th>Body</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className={`iipe-badge ${a.type === "ALERT" ? "danger" : ""}`}>
                    {a.type === "ALERT" ? "ALERT" : "UPDATE"}
                  </span>
                </td>
                <td>
                  <strong>{a.title}</strong>
                </td>
                <td className="iipe-muted" style={{ maxWidth: 320 }}>
                  {a.body.length > 120 ? a.body.slice(0, 120) + "…" : a.body}
                </td>
                <td className="iipe-muted">{formatDate(a.createdAt)}</td>
                <td>
                  {a.published ? (
                    <span className="iipe-badge">Published</span>
                  ) : (
                    <span className="iipe-muted">Hidden</span>
                  )}
                </td>
                <td>
                  <div className="iipe-row" style={{ gap: 6 }}>
                    <button
                      className="iipe-btn secondary"
                      type="button"
                      onClick={() => openEdit(a)}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    <button
                      className="iipe-btn secondary"
                      type="button"
                      onClick={() => togglePublished(a)}
                      disabled={busy}
                    >
                      {a.published ? "Hide" : "Publish"}
                    </button>
                    <button
                      className="iipe-btn danger"
                      type="button"
                      onClick={() => remove(a)}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="iipe-muted">
                  {announcements.length === 0
                    ? "No announcements yet."
                    : "No announcements match your search."}
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
                {modal.mode === "add" ? "Add announcement" : "Edit announcement"}
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
              <label className="iipe-label" htmlFor="ann-type">
                Type
              </label>
              <select
                id="ann-type"
                className="iipe-select"
                value={type}
                onChange={(e) => setType(e.target.value as "UPDATE" | "ALERT")}
              >
                <option value="UPDATE">Update</option>
                <option value="ALERT">Alert</option>
              </select>
            </div>
            <div className="iipe-field">
              <label className="iipe-label" htmlFor="ann-title">
                Title
              </label>
              <input
                id="ann-title"
                className="iipe-input"
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="iipe-field">
              <label className="iipe-label" htmlFor="ann-body">
                Body
              </label>
              <textarea
                id="ann-body"
                className="iipe-input"
                rows={4}
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <label
              className="iipe-label"
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
              />
              Published (visible on the login page)
            </label>

            <div className="iipe-form-actions">
              <button className="iipe-btn" type="submit" disabled={busy}>
                {busy ? "Saving…" : modal.mode === "add" ? "Create announcement" : "Save changes"}
              </button>
              <button
                className="iipe-btn secondary"
                type="button"
                onClick={() => setModal(null)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
