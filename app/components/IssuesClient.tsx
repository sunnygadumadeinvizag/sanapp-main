"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPath } from "sanapp-common-ui";

type App = { id: string; name: string; url: string };

type Issue = {
  id: string;
  applicationId: string;
  application: { id: string; name: string; url: string };
  username: string;
  name: string;
  title: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const ALL_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const ALL_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function IssuesClient({
  apps,
  initialIssues,
  initialTotal,
  scope,
  isSuperAdmin,
}: {
  apps: App[];
  initialIssues: Issue[];
  initialTotal: number;
  scope: "mine" | "all";
  isSuperAdmin: boolean;
}) {
  const [rows, setRows] = useState<Issue[]>(initialIssues);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [appId, setAppId] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const limit = 10;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Raise-issue form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [raiseAppId, setRaiseAppId] = useState(apps[0]?.id ?? "");
  const [priority, setPriority] = useState("MEDIUM");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const flash = (ok: boolean, t: string) => {
    setMsg(ok ? t : null);
    setErr(ok ? null : t);
    setTimeout(() => {
      setMsg(null);
      setErr(null);
    }, 5000);
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedQ(q), 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      scope,
      page: String(page),
      limit: String(limit),
    });
    if (status) params.set("status", status);
    if (appId) params.set("appId", appId);
    if (debouncedQ) params.set("q", debouncedQ);
    try {
      const res = await fetch(apiPath(`/api/issues?${params}`), { cache: "no-store" });
      const data = await res.json();
      setRows(data.issues ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [scope, page, status, appId, debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / limit));

  async function raise(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!title.trim() || !description.trim() || !raiseAppId) {
      setErr("Title, description and application are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(apiPath("/api/issues"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          applicationId: raiseAppId,
          priority,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error ?? "Could not raise the issue.");
        return;
      }
      flash(true, `Issue raised against ${data.issue.application.name}.`);
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setPage(1);
      setStatus("");
      setAppId("");
      setQ("");
      setDebouncedQ("");
      load();
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {(msg || err) && (
        <div className={`rounded-md border px-3 py-2 text-sm ${err ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"}`}>
          {err ?? msg}
        </div>
      )}

      {/* Raise an issue */}
      <div className="iipe-card">
        <h3 className="iipe-h3">Report a technical issue</h3>
        <p className="iipe-muted" style={{ marginBottom: 12 }}>
          Choose the application and describe the problem — the issue is raised in Log Request (Intranet Issue) and the category's POC works it.
        </p>
        <form onSubmit={raise} className="space-y-3">
          <div className="iipe-grid iipe-grid-2">
            <div>
              <label className="iipe-label" htmlFor="issue-app">Application *</label>
              <select
                id="issue-app"
                className="iipe-input"
                value={raiseAppId}
                onChange={(e) => setRaiseAppId(e.target.value)}
              >
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="iipe-label" htmlFor="issue-priority">Priority</label>
              <select
                id="issue-priority"
                className="iipe-input"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {ALL_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="iipe-label" htmlFor="issue-title">Title *</label>
            <input
              id="issue-title"
              className="iipe-input"
              placeholder="Brief summary of the problem"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="iipe-label" htmlFor="issue-desc">Description *</label>
            <textarea
              id="issue-desc"
              rows={4}
              className="iipe-input"
              placeholder="What happened, when, what you tried…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <button type="submit" className="iipe-btn" disabled={busy}>
            {busy && <span style={{ marginRight: 6 }}>…</span>}
            Raise issue
          </button>
        </form>
      </div>

      {/* List */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative" style={{ flex: "1 1 220px", minWidth: 220 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--iipe-muted)", fontSize: 13 }}>🔍</span>
            <input
              className="iipe-input"
              style={{ paddingLeft: 34 }}
              placeholder="Search title, description, user…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="iipe-input"
            style={{ width: "auto" }}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select
            className="iipe-input"
            style={{ width: "auto" }}
            value={appId}
            onChange={(e) => {
              setAppId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All applications</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="iipe-card">
          {loading ? (
            <p className="iipe-muted" style={{ padding: 20 }}>Loading…</p>
          ) : rows.length === 0 ? (
            <p className="iipe-muted" style={{ padding: 20 }}>No issues found.</p>
          ) : (
            <div className="iipe-table-scroll">
              <table className="iipe-table">
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th>Application</th>
                    <th>Status</th>
                    <th>Priority</th>
                    {scope === "all" && <th>Raised by</th>}
                    <th>Raised</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <a href={apiPath(`/issues/${i.id}`)} style={{ textDecoration: "none" }}>
                          <strong>{i.title}</strong>
                        </a>
                        <div className="iipe-muted">{i.description.length > 90 ? i.description.slice(0, 90) + "…" : i.description}</div>
                      </td>
                      <td>
                        <span className="iipe-badge">{i.application.name}</span>
                      </td>
                      <td>
                        <span className={`iipe-badge ${i.status === "RESOLVED" || i.status === "CLOSED" ? "" : "accent"}`}>
                          {STATUS_LABELS[i.status] ?? i.status}
                        </span>
                      </td>
                      <td>
                        <span className="iipe-badge">{PRIORITY_LABELS[i.priority] ?? i.priority}</span>
                      </td>
                      {scope === "all" && (
                        <td>
                          {i.name} <span className="iipe-muted">@{i.username}</span>
                        </td>
                      )}
                      <td>
                        <span className="iipe-muted">{new Date(i.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {pages > 1 && (
          <div className="iipe-row" style={{ alignItems: "center" }}>
            <span className="iipe-muted">
              {total} issue{total === 1 ? "" : "s"} · page {page} of {pages}
            </span>
            <span className="iipe-spacer" />
            <button className="iipe-btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <button className="iipe-btn secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
