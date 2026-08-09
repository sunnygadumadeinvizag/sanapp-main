"use client";

import { useState } from "react";

export type MatrixUser = { id: string; username: string; name: string };
export type MatrixApp = { clientId: string; name: string; url: string; enabled: boolean };
export type MatrixGrant = { userId: string | null; username: string; clientId: string };

export function AccessMatrix({
  users,
  applications,
  initialGrants,
  focusUsername,
}: {
  users: MatrixUser[];
  applications: MatrixApp[];
  initialGrants: MatrixGrant[];
  focusUsername?: string;
}) {
  const [grants, setGrants] = useState<MatrixGrant[]>(initialGrants);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function hasGrant(user: MatrixUser, app: MatrixApp) {
    return grants.some(
      (g) => g.clientId === app.clientId && (g.userId === user.id || g.username === user.username)
    );
  }

  async function toggle(user: MatrixUser, app: MatrixApp, checked: boolean) {
    const key = `${user.id}:${app.clientId}`;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          username: user.username,
          clientId: app.clientId,
          allowed: checked,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      setGrants((prev) => {
        const rest = prev.filter(
          (g) => !(g.clientId === app.clientId && g.username === user.username)
        );
        return checked
          ? [...rest, { userId: user.id, username: user.username, clientId: app.clientId }]
          : rest;
      });
    } catch {
      setError("Could not update access. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && <div className="iipe-alert danger">{error}</div>}
      <div className="iipe-table-scroll">
        <table className="iipe-table">
          <thead>
            <tr>
              <th>User</th>
              {applications.map((app) => (
                <th key={app.clientId} style={{ textAlign: "center" }}>
                  {app.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                style={
                  focusUsername && focusUsername === user.username
                    ? { background: "var(--iipe-primary-light)" }
                    : undefined
                }
              >
                <td>
                  <strong>{user.name}</strong>
                  <div className="iipe-muted">@{user.username}</div>
                </td>
                {applications.map((app) => {
                  const checked = hasGrant(user, app);
                  const key = `${user.id}:${app.clientId}`;
                  const disabled = busy === key || !app.enabled;
                  return (
                    <td key={app.clientId} style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) => toggle(user, app, e.target.checked)}
                        aria-label={`${user.name} — ${app.name}`}
                        style={{ width: 18, height: 18, cursor: disabled ? "not-allowed" : "pointer" }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
