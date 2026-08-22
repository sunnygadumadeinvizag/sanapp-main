"use client";

import { useMemo, useState } from "react";
import { apiPath } from "sanapp-common-ui";
import {
  MatrixUser,
  MatrixApp,
  MatrixGrant,
  PRIMARY_ROLES,
  getRoleLabel,
} from "./matrixTypes";

export function AccessMatrixInspector({
  users,
  applications,
  initialGrants,
  initialApp,
}: {
  users: MatrixUser[];
  applications: MatrixApp[];
  initialGrants: MatrixGrant[];
  initialApp?: string;
}) {
  const [grants, setGrants] = useState<MatrixGrant[]>(initialGrants);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "danger" | "info"; message: string } | null>(null);

  // Inspected app selection
  const [inspectedAppClientId, setInspectedAppClientId] = useState<string>(
    initialApp && applications.some((a) => a.clientId === initialApp)
      ? initialApp
      : applications[0]?.clientId ?? ""
  );

  // Search & filter within the inspector
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterRole, setFilterRole] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "GRANTED" | "UNAUTHORIZED">("ALL");

  const grantLookup = useMemo(() => {
    const set = new Set<string>();
    for (const g of grants) set.add(`${g.username}:${g.clientId}`);
    return set;
  }, [grants]);

  function hasGrant(username: string, clientId: string) {
    return grantLookup.has(`${username}:${clientId}`);
  }

  // Active inspected app
  const inspectedApp = applications.find((a) => a.clientId === inspectedAppClientId) || applications[0];

  const inspectedAppGrantedUsers = useMemo(() => {
    if (!inspectedApp) return [];
    return users.filter((u) => hasGrant(u.username, inspectedApp.clientId));
  }, [inspectedApp, users, grantLookup]);

  // Toggle single user
  async function toggleSingle(user: MatrixUser, app: MatrixApp, checked: boolean) {
    const key = `${user.username}:${app.clientId}`;
    setBusyKeys((prev) => new Set(prev).add(key));
    setFeedback(null);

    setGrants((prev) => {
      const rest = prev.filter((g) => !(g.clientId === app.clientId && g.username === user.username));
      return checked ? [...rest, { userId: user.id, username: user.username, clientId: app.clientId }] : rest;
    });

    try {
      const res = await fetch(apiPath("/api/grants"), {
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
    } catch {
      setGrants((prev) => {
        const rest = prev.filter((g) => !(g.clientId === app.clientId && g.username === user.username));
        return !checked ? [...rest, { userId: user.id, username: user.username, clientId: app.clientId }] : rest;
      });
      setFeedback({ type: "danger", message: `Failed to update access for @${user.username}` });
    } finally {
      setBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  // Bulk grant / revoke for role
  async function executeGroupGrant(
    userList: MatrixUser[],
    clientId: string,
    grant: boolean,
    groupName: string
  ) {
    if (userList.length === 0) return;
    setBatchBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(apiPath("/api/grants/batch"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: grant ? "grant" : "revoke",
          users: userList.map((u) => ({ userId: u.id, username: u.username })),
          clientIds: [clientId],
        }),
      });
      if (!res.ok) throw new Error("Group update failed");

      setGrants((prev) => {
        const usernames = new Set(userList.map((u) => u.username));
        let updated = prev.filter((g) => !(usernames.has(g.username) && g.clientId === clientId));
        if (grant) {
          for (const u of userList) {
            updated.push({ userId: u.id, username: u.username, clientId });
          }
        }
        return updated;
      });

      setFeedback({
        type: "success",
        message: `${grant ? "Granted" : "Revoked"} ${inspectedApp?.name} for all ${userList.length} members of "${groupName}".`,
      });
    } catch {
      setFeedback({ type: "danger", message: `Failed to update ${groupName}. Please try again.` });
    } finally {
      setBatchBusy(false);
    }
  }

  // Filtered users inside the app inspector table
  const displayedUsers = useMemo(() => {
    if (!inspectedApp) return [];
    return users.filter((u) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          u.name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q));
        if (!match) return false;
      }

      if (filterRole !== "ALL" && u.primaryRole !== filterRole) return false;

      const isGranted = hasGrant(u.username, inspectedApp.clientId);
      if (filterStatus === "GRANTED" && !isGranted) return false;
      if (filterStatus === "UNAUTHORIZED" && isGranted) return false;

      return true;
    });
  }, [users, inspectedApp, searchQuery, filterRole, filterStatus, grantLookup]);

  if (!inspectedApp) {
    return <div className="iipe-alert">No applications found.</div>;
  }

  return (
    <div>
      {/* Toast Feedback */}
      {feedback && (
        <div className={`iipe-alert ${feedback.type}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span>{feedback.message}</span>
          <button type="button" className="iipe-btn secondary" style={{ padding: "2px 8px", fontSize: "0.8rem", marginLeft: 12 }} onClick={() => setFeedback(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Application Selector Pills */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", color: "var(--iipe-muted)", marginBottom: 8 }}>
          Select Application to Inspect:
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {applications.map((app) => {
            const isCurrent = app.clientId === inspectedApp.clientId;
            const count = users.filter((u) => hasGrant(u.username, app.clientId)).length;
            return (
              <button
                key={app.clientId}
                type="button"
                onClick={() => setInspectedAppClientId(app.clientId)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--iipe-radius)",
                  border: isCurrent ? "2px solid var(--iipe-primary)" : "1px solid var(--iipe-border)",
                  background: isCurrent ? "var(--iipe-primary)" : "var(--iipe-surface)",
                  color: isCurrent ? "#fff" : "var(--iipe-text)",
                  cursor: "pointer",
                  fontWeight: isCurrent ? 700 : 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>{app.name}</span>
                <span
                  style={{
                    background: isCurrent ? "rgba(255,255,255,0.25)" : "var(--iipe-bg)",
                    color: isCurrent ? "#fff" : "var(--iipe-muted)",
                    padding: "1px 6px",
                    borderRadius: 999,
                    fontSize: "0.75rem",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Application Overview Card */}
      <div
        style={{
          background: "var(--iipe-surface)",
          border: "1px solid var(--iipe-border)",
          borderRadius: "var(--iipe-radius)",
          padding: "20px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ margin: 0 }}>{inspectedApp.name}</h2>
              <span className="iipe-badge" style={{ fontSize: "0.8rem" }}>Category: {inspectedApp.category}</span>
              {inspectedApp.enabled ? (
                <span className="iipe-badge accent" style={{ fontSize: "0.8rem" }}>Active</span>
              ) : (
                <span className="iipe-badge danger" style={{ fontSize: "0.8rem" }}>Disabled</span>
              )}
            </div>
            <div className="iipe-muted" style={{ marginTop: 4, fontSize: "0.88rem" }}>
              Client ID: <code>{inspectedApp.clientId}</code> • URL:{" "}
              <a href={inspectedApp.url} target="_blank" rel="noreferrer">
                {inspectedApp.url} ↗
              </a>
            </div>
            {inspectedApp.description && (
              <p style={{ marginTop: 8, marginBottom: 0, fontSize: "0.9rem" }}>{inspectedApp.description}</p>
            )}
          </div>

          <div
            style={{
              textAlign: "center",
              padding: "12px 24px",
              background: "var(--iipe-primary-light)",
              borderRadius: "var(--iipe-radius)",
            }}
          >
            <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--iipe-primary-dark)" }}>
              {inspectedAppGrantedUsers.length}{" "}
              <span style={{ fontSize: "0.95rem", fontWeight: 500 }}>/ {users.length}</span>
            </div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--iipe-primary-dark)", textTransform: "uppercase" }}>
              {Math.round((inspectedAppGrantedUsers.length / (users.length || 1)) * 100)}% Access Coverage
            </div>
          </div>
        </div>

        {/* Role-Wise Access Breakdown */}
        <div style={{ marginTop: 24, borderTop: "1px solid var(--iipe-border)", paddingTop: 16 }}>
          <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Role-Level Access &amp; Bulk Allocation</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {PRIMARY_ROLES.map((pr) => {
              const roleUsers = users.filter((u) => u.primaryRole === pr.value);
              const grantedRoleUsers = roleUsers.filter((u) => hasGrant(u.username, inspectedApp.clientId));
              const percentage = roleUsers.length > 0 ? Math.round((grantedRoleUsers.length / roleUsers.length) * 100) : 0;
              const allGranted = roleUsers.length > 0 && grantedRoleUsers.length === roleUsers.length;

              return (
                <div
                  key={pr.value}
                  style={{
                    border: "1px solid var(--iipe-border)",
                    borderRadius: "var(--iipe-radius)",
                    padding: "12px 14px",
                    background: "var(--iipe-bg)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{pr.label}</div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                      {grantedRoleUsers.length} / {roleUsers.length} ({percentage}%)
                    </div>
                  </div>

                  <div
                    style={{
                      width: "100%",
                      height: 6,
                      background: "var(--iipe-border)",
                      borderRadius: 3,
                      overflow: "hidden",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        width: `${percentage}%`,
                        height: "100%",
                        background: percentage === 100 ? "var(--iipe-success)" : "var(--iipe-primary)",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="iipe-btn primary"
                      disabled={batchBusy || roleUsers.length === 0 || allGranted}
                      style={{ padding: "3px 8px", fontSize: "0.74rem", flex: 1 }}
                      onClick={() => executeGroupGrant(roleUsers, inspectedApp.clientId, true, pr.label)}
                    >
                      + Grant All {roleUsers.length}
                    </button>
                    <button
                      type="button"
                      className="iipe-btn danger"
                      disabled={batchBusy || grantedRoleUsers.length === 0}
                      style={{ padding: "3px 8px", fontSize: "0.74rem", flex: 1 }}
                      onClick={() => executeGroupGrant(roleUsers, inspectedApp.clientId, false, pr.label)}
                    >
                      - Revoke All
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* User Access List for this App */}
      <div
        style={{
          background: "var(--iipe-surface)",
          border: "1px solid var(--iipe-border)",
          borderRadius: "var(--iipe-radius)",
          padding: "16px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>
            User Access List for {inspectedApp.name} ({displayedUsers.length} users shown)
          </h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              className="iipe-input"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ height: 32, fontSize: "0.82rem", width: 180 }}
            />
            <select
              className="iipe-select"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              style={{ height: 32, fontSize: "0.82rem" }}
            >
              <option value="ALL">All Roles</option>
              {PRIMARY_ROLES.map((pr) => (<option key={pr.value} value={pr.value}>{pr.label}</option>))}
            </select>
            <select
              className="iipe-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              style={{ height: 32, fontSize: "0.82rem" }}
            >
              <option value="ALL">All Access Status</option>
              <option value="GRANTED">Granted Only</option>
              <option value="UNAUTHORIZED">Unauthorized Only</option>
            </select>
          </div>
        </div>

        <div className="iipe-table-scroll" style={{ maxHeight: "50vh", overflowY: "auto" }}>
          <table className="iipe-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th style={{ width: 140, textAlign: "center" }}>Access Status</th>
                <th style={{ width: 120, textAlign: "center" }}>Toggle</th>
              </tr>
            </thead>
            <tbody>
              {displayedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "24px" }}>
                    <div className="iipe-muted">No users match the search and filter criteria.</div>
                  </td>
                </tr>
              ) : (
                displayedUsers.map((user) => {
                  const granted = hasGrant(user.username, inspectedApp.clientId);
                  const key = `${user.username}:${inspectedApp.clientId}`;
                  const isBusy = busyKeys.has(key) || batchBusy;
                  return (
                    <tr
                      key={user.id}
                      style={{
                        background: granted ? "color-mix(in srgb, var(--iipe-primary) 5%, transparent)" : undefined,
                      }}
                    >
                      <td>
                        <strong>{user.name}</strong>
                        <div className="iipe-muted" style={{ fontSize: "0.8rem" }}>@{user.username}</div>
                      </td>
                      <td>
                        <span className="iipe-badge" style={{ fontSize: "0.72rem" }}>
                          {getRoleLabel(user.primaryRole)}
                        </span>
                      </td>
                      <td>{user.departmentName || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        {granted ? (
                          <span className="iipe-badge accent" style={{ fontSize: "0.72rem", fontWeight: 700 }}>
                            ✓ Granted
                          </span>
                        ) : (
                          <span className="iipe-badge" style={{ fontSize: "0.72rem", color: "var(--iipe-muted)" }}>
                            No Access
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className={`iipe-btn ${granted ? "danger" : "primary"}`}
                          disabled={isBusy || !inspectedApp.enabled}
                          style={{ padding: "3px 10px", fontSize: "0.75rem" }}
                          onClick={() => toggleSingle(user, inspectedApp, !granted)}
                        >
                          {isBusy ? "..." : granted ? "Revoke" : "Grant"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
