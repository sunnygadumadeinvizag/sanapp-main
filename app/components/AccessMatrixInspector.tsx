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

  // Search & filter within inspector
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterRole, setFilterRole] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ADMIN" | "USER" | "UNAUTHORIZED">("ALL");

  const grantMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of grants) map.set(`${g.username}:${g.clientId}`, g.role || "USER");
    return map;
  }, [grants]);

  function getGrantRole(username: string, clientId: string): string | null {
    return grantMap.get(`${username}:${clientId}`) ?? null;
  }

  // Active inspected app
  const inspectedApp = applications.find((a) => a.clientId === inspectedAppClientId) || applications[0];

  const inspectedAppStats = useMemo(() => {
    if (!inspectedApp) return { total: 0, admins: 0, regular: 0 };
    let admins = 0;
    let regular = 0;
    for (const u of users) {
      const r = getGrantRole(u.username, inspectedApp.clientId);
      if (r === "APP_ADMIN") admins += 1;
      else if (r === "USER") regular += 1;
    }
    return { total: admins + regular, admins, regular };
  }, [inspectedApp, users, grantMap]);

  // Toggle single user
  async function toggleSingle(user: MatrixUser, app: MatrixApp, checked: boolean, role: "USER" | "APP_ADMIN" = "USER") {
    const key = `${user.username}:${app.clientId}`;
    setBusyKeys((prev) => new Set(prev).add(key));
    setFeedback(null);

    const oldGrants = [...grants];

    setGrants((prev) => {
      const rest = prev.filter((g) => !(g.clientId === app.clientId && g.username === user.username));
      return checked ? [...rest, { userId: user.id, username: user.username, clientId: app.clientId, role }] : rest;
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
          role,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
    } catch {
      setGrants(oldGrants);
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
    groupName: string,
    role: "USER" | "APP_ADMIN" = "USER"
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
          role,
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
            updated.push({ userId: u.id, username: u.username, clientId, role });
          }
        }
        return updated;
      });

      setFeedback({
        type: "success",
        message: `${grant ? `Granted (${role === "APP_ADMIN" ? "App Admin" : "User"})` : "Revoked"} ${inspectedApp?.name} for all ${userList.length} members of "${groupName}".`,
      });
    } catch {
      setFeedback({ type: "danger", message: `Failed to update ${groupName}. Please try again.` });
    } finally {
      setBatchBusy(false);
    }
  }

  // Filtered users in inspector table
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

      const role = getGrantRole(u.username, inspectedApp.clientId);
      if (filterStatus === "ADMIN" && role !== "APP_ADMIN") return false;
      if (filterStatus === "USER" && role !== "USER") return false;
      if (filterStatus === "UNAUTHORIZED" && role !== null) return false;

      return true;
    });
  }, [users, inspectedApp, searchQuery, filterRole, filterStatus, grantMap]);

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
            const count = users.filter((u) => getGrantRole(u.username, app.clientId) !== null).length;
            const adminCount = users.filter((u) => getGrantRole(u.username, app.clientId) === "APP_ADMIN").length;
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
                  {count} {adminCount > 0 && `(★${adminCount})`}
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

          <div style={{ display: "flex", gap: 12 }}>
            <div
              style={{
                textAlign: "center",
                padding: "12px 20px",
                background: "var(--iipe-primary-light)",
                borderRadius: "var(--iipe-radius)",
              }}
            >
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--iipe-primary-dark)" }}>
                {inspectedAppStats.total}{" "}
                <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>/ {users.length}</span>
              </div>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--iipe-primary-dark)", textTransform: "uppercase" }}>
                Total Access ({Math.round((inspectedAppStats.total / (users.length || 1)) * 100)}%)
              </div>
            </div>

            <div
              style={{
                textAlign: "center",
                padding: "12px 20px",
                background: "color-mix(in srgb, var(--iipe-accent) 20%, transparent)",
                borderRadius: "var(--iipe-radius)",
                border: "1px solid #d9a441",
              }}
            >
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#1c2b28" }}>
                {inspectedAppStats.admins}
              </div>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#1c2b28", textTransform: "uppercase" }}>
                ⭐ App Admins
              </div>
            </div>
          </div>
        </div>

        {/* Role-Wise Access Breakdown */}
        <div style={{ marginTop: 24, borderTop: "1px solid var(--iipe-border)", paddingTop: 16 }}>
          <h3 style={{ fontSize: "1rem", marginBottom: 12 }}>Role-Level Access &amp; Bulk Allocation</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {PRIMARY_ROLES.map((pr) => {
              const roleUsers = users.filter((u) => u.primaryRole === pr.value);
              const grantedRoleUsers = roleUsers.filter((u) => getGrantRole(u.username, inspectedApp.clientId) !== null);
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
                      onClick={() => executeGroupGrant(roleUsers, inspectedApp.clientId, true, pr.label, "USER")}
                    >
                      + Grant Users
                    </button>
                    <button
                      type="button"
                      className="iipe-btn secondary"
                      disabled={batchBusy || roleUsers.length === 0}
                      style={{ padding: "3px 8px", fontSize: "0.74rem", flex: 1 }}
                      onClick={() => executeGroupGrant(roleUsers, inspectedApp.clientId, true, pr.label, "APP_ADMIN")}
                    >
                      ⭐ Make Admins
                    </button>
                    <button
                      type="button"
                      className="iipe-btn danger"
                      disabled={batchBusy || grantedRoleUsers.length === 0}
                      style={{ padding: "3px 8px", fontSize: "0.74rem" }}
                      onClick={() => executeGroupGrant(roleUsers, inspectedApp.clientId, false, pr.label)}
                    >
                      Revoke
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
              <option value="ADMIN">⭐ App Admins Only</option>
              <option value="USER">👤 Regular Users Only</option>
              <option value="UNAUTHORIZED">No Access Only</option>
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
                <th style={{ width: 150, textAlign: "center" }}>Access Status</th>
                <th style={{ width: 220, textAlign: "center" }}>Actions</th>
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
                  const role = getGrantRole(user.username, inspectedApp.clientId);
                  const isGranted = role !== null;
                  const isAppAdmin = role === "APP_ADMIN";
                  const key = `${user.username}:${inspectedApp.clientId}`;
                  const isBusy = busyKeys.has(key) || batchBusy;
                  return (
                    <tr
                      key={user.id}
                      style={{
                        background: isAppAdmin
                          ? "color-mix(in srgb, var(--iipe-accent) 12%, transparent)"
                          : isGranted
                          ? "color-mix(in srgb, var(--iipe-primary) 5%, transparent)"
                          : undefined,
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
                        {isAppAdmin ? (
                          <span className="iipe-badge" style={{ fontSize: "0.75rem", fontWeight: 700, background: "#d9a441", color: "#1c2b28" }}>
                            ⭐ App Admin
                          </span>
                        ) : isGranted ? (
                          <span className="iipe-badge accent" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                            ✓ User
                          </span>
                        ) : (
                          <span className="iipe-badge" style={{ fontSize: "0.72rem", color: "var(--iipe-muted)" }}>
                            No Access
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          {!isGranted ? (
                            <>
                              <button
                                type="button"
                                className="iipe-btn primary"
                                disabled={isBusy || !inspectedApp.enabled}
                                style={{ padding: "3px 8px", fontSize: "0.72rem" }}
                                onClick={() => toggleSingle(user, inspectedApp, true, "USER")}
                              >
                                + Grant User
                              </button>
                              <button
                                type="button"
                                className="iipe-btn secondary"
                                disabled={isBusy || !inspectedApp.enabled}
                                style={{ padding: "3px 8px", fontSize: "0.72rem" }}
                                onClick={() => toggleSingle(user, inspectedApp, true, "APP_ADMIN")}
                              >
                                ⭐ Grant Admin
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="iipe-btn secondary"
                                disabled={isBusy}
                                style={{ padding: "3px 8px", fontSize: "0.72rem" }}
                                onClick={() => toggleSingle(user, inspectedApp, true, isAppAdmin ? "USER" : "APP_ADMIN")}
                                title={isAppAdmin ? "Demote to regular user" : "Promote to App Admin"}
                              >
                                {isAppAdmin ? "Demote to User" : "⭐ Make Admin"}
                              </button>
                              <button
                                type="button"
                                className="iipe-btn danger"
                                disabled={isBusy}
                                style={{ padding: "3px 8px", fontSize: "0.72rem" }}
                                onClick={() => toggleSingle(user, inspectedApp, false)}
                              >
                                Revoke
                              </button>
                            </>
                          )}
                        </div>
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
