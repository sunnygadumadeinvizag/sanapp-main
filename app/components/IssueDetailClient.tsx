"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath, appUrl } from "sanapp-common-ui";

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
  updatedAt: string;
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

export function IssueDetailClient({
  issue,
  isSuperAdmin,
}: {
  issue: Issue;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(issue.status);
  const [resolution, setResolution] = useState(issue.resolution ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(apiPath(`/api/issues/${issue.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, resolution }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error ?? "Update failed");
        return;
      }
      setMsg("Issue updated.");
      router.refresh();
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {(msg || err) && (
        <div className={`rounded-md border px-3 py-2 text-sm ${err ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"}`}>
          {err ?? msg}
        </div>
      )}

      <div className="iipe-row">
        <span className={`iipe-badge ${issue.status === "OPEN" ? "danger" : issue.status === "IN_PROGRESS" ? "accent" : ""}`}>
          {STATUS_LABELS[issue.status]}
        </span>
        <span className="iipe-badge">{PRIORITY_LABELS[issue.priority]} priority</span>
        <span className="iipe-badge">{issue.application.name}</span>
        <span className="iipe-spacer" />
        <a href={appUrl(issue.application.url)} target="_blank" rel="noreferrer" className="iipe-btn secondary">
          Open {issue.application.name} →
        </a>
      </div>

      <div className="iipe-card">
        <h3 className="iipe-h3">{issue.title}</h3>
        <p className="iipe-muted">
          Raised by {issue.name} (@{issue.username}) ·{" "}
          {new Date(issue.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
        <p style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{issue.description}</p>
      </div>

      {isSuperAdmin && (
        <form onSubmit={save} className="iipe-card">
          <h3 className="iipe-h3">Work this issue (Super Admin)</h3>
          <div className="space-y-3">
            <div>
              <label className="iipe-label" htmlFor="issue-status">Status</label>
              <select
                id="issue-status"
                className="iipe-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as Issue["status"])}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="iipe-label" htmlFor="issue-resolution">Resolution / reply</label>
              <textarea
                id="issue-resolution"
                rows={3}
                className="iipe-input"
                placeholder="What was the cause and how was it fixed?"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              />
            </div>
            <button type="submit" className="iipe-btn" disabled={busy}>
              {busy && <span style={{ marginRight: 6 }}>…</span>}
              Save update
            </button>
          </div>
        </form>
      )}

      {issue.resolution && (
        <div className="iipe-card">
          <h3 className="iipe-h3">Resolution</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{issue.resolution}</p>
          {issue.resolvedAt && (
            <p className="iipe-muted">
              Resolved {new Date(issue.resolvedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
