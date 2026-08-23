"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { apiPath } from "sanapp-common-ui";
import {
  MatrixUser,
  MatrixApp,
  MatrixGrant,
  PRIMARY_ROLES,
  getRoleLabel,
} from "./matrixTypes";
import "../admin-console/app-matrix/matrix.css";

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

  // Active inspected app — first registered app by default
  const inspectedApp = useMemo(() => {
    const match = applications.find(
      (a) =>
        a.clientId.toLowerCase() === (initialApp ?? "").toLowerCase() ||
        a.id.toLowerCase() === (initialApp ?? "").toLowerCase()
    );
    return match ?? applications[0];
  }, [applications, initialApp]);

  // Search & filter within inspector
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterRole, setFilterRole] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ADMIN" | "USER" | "UNAUTHORIZED">("ALL");

  const grantMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of grants) {
      if (g.username && g.clientId) {
        map.set(`${g.username.toLowerCase().trim()}:${g.clientId.toLowerCase().trim()}`, g.role || "USER");
      }
    }
    return map;
  }, [grants]);

  function getGrantRole(username: string, clientId: string): string | null {
    if (!username || !clientId) return null;
    return grantMap.get(`${username.toLowerCase().trim()}:${clientId.toLowerCase().trim()}`) ?? null;
  }

  const appCounts = useMemo(() => {
    const totals = new Map<string, number>();
    const admins = new Map<string, number>();
    for (const a of applications) {
      totals.set(a.clientId, 0);
      admins.set(a.clientId, 0);
    }
    for (const u of users) {
      for (const a of applications) {
        const r = getGrantRole(u.username, a.clientId);
        if (r) totals.set(a.clientId, (totals.get(a.clientId) ?? 0) + 1);
        if (r === "APP_ADMIN") admins.set(a.clientId, (admins.get(a.clientId) ?? 0) + 1);
      }
    }
    return { totals, admins };
  }, [users, applications, grantMap]);

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
    const key = `${user.username.toLowerCase().trim()}:${app.clientId.toLowerCase().trim()}`;
    setBusyKeys((prev) => new Set(prev).add(key));
    setFeedback(null);

    const oldGrants = [...grants];

    setGrants((prev) => {
      const uLower = user.username.toLowerCase().trim();
      const cLower = app.clientId.toLowerCase().trim();
      const rest = prev.filter(
        (g) => !(g.clientId.toLowerCase().trim() === cLower && g.username.toLowerCase().trim() === uLower)
      );
      return checked
        ? [...rest, { userId: user.id, username: user.username, clientId: app.clientId, role }]
        : rest;
    });

    try {
      const res = await fetch(apiPath("/api/grants"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          userId: user.id,
          username: user.username,
          clientId: app.clientId,
          allowed: checked,
          role,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setFeedback({
        type: "success",
        message: `${checked ? (role === "APP_ADMIN" ? "⭐ Granted App Admin to" : "✓ Granted access to") : "Revoked access for"} ${user.name} (@${user.username}) on ${app.name}.`,
      });
    } catch (err: any) {
      setGrants(oldGrants);
      setFeedback({ type: "danger", message: `Failed to update access for @${user.username}: ${err.message || err}` });
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
        credentials: "same-origin",
        body: JSON.stringify({
          action: grant ? "grant" : "revoke",
          role,
          users: userList.map((u) => ({ userId: u.id, username: u.username })),
          clientIds: [clientId],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setGrants((prev) => {
        const uSet = new Set(userList.map((u) => u.username.toLowerCase().trim()));
        const cLower = clientId.toLowerCase().trim();
        let updated = prev.filter(
          (g) => !(uSet.has(g.username.toLowerCase().trim()) && g.clientId.toLowerCase().trim() === cLower)
        );
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
    } catch (err: any) {
      setFeedback({ type: "danger", message: `Failed to update ${groupName}: ${err.message || err}` });
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
    <div className="mx-root">
      {/* Toast Feedback */}
      {feedback && (
        <div className={`iipe-alert ${feedback.type} mx-toast`} role="status">
          <span>{feedback.message}</span>
          <button type="button" className="iipe-btn secondary" aria-label="Dismiss" onClick={() => setFeedback(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Application selector strip */}
      <div>
        <div className="mx-card-title" style={{ marginBottom: 8 }}>Application</div>
        <div className="mx-app-strip" role="tablist" aria-label="Select application to inspect">
          {applications.map((app) => {
            const isCurrent = app.clientId === inspectedApp.clientId;
            const count = appCounts.totals.get(app.clientId) ?? 0;
            const adminCount = appCounts.admins.get(app.clientId) ?? 0;
            return (
              <Link
                key={app.clientId}
                href={`/admin-console/app-matrix/inspector?app=${app.clientId}`}
                className={`mx-app-pill${isCurrent ? " active" : ""}`}
                aria-current={isCurrent ? "page" : undefined}
              >
                <span>{app.name}</span>
                <span className="mx-app-pill-count">
                  {count}
                  {adminCount > 0 && <span className="star" title={`${adminCount} app admin(s)`}>★{adminCount}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Application Overview */}
      <div className="mx-card">
        <div className="mx-overview">
          <div className="mx-overview-id">
            <h2>
              {inspectedApp.name}
              <span className="iipe-badge">{inspectedApp.category}</span>
              {inspectedApp.enabled ? (
                <span className="iipe-badge accent">Active</span>
              ) : (
                <span className="iipe-badge danger">Disabled</span>
              )}
            </h2>
            <div className="mx-overview-meta">
              <span><code>{inspectedApp.clientId}</code></span>
              <span>
                <a href={inspectedApp.url} target="_blank" rel="noreferrer">{inspectedApp.url} ↗</a>
              </span>
            </div>
            {inspectedApp.description && <div className="mx-overview-meta"><span>{inspectedApp.description}</span></div>}
          </div>

          <div className="mx-stats">
            <div className="mx-stat">
              <strong>{inspectedAppStats.total}</strong>
              <span>of {users.length} users</span>
            </div>
            <div className="mx-stat">
              <strong>{inspectedAppStats.regular}</strong>
              <span>regular</span>
            </div>
            <div className="mx-stat accent">
              <strong>{inspectedAppStats.admins}</strong>
              <span>⭐ admins</span>
            </div>
          </div>
        </div>

        {/* Role-Wise Access Breakdown */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--iipe-border)" }}>
          <h3 className="mx-card-title">Role-Level Access &amp; Bulk Allocation</h3>
          <div className="mx-role-rows">
            {PRIMARY_ROLES.map((pr) => {
              const roleUsers = users.filter((u) => u.primaryRole === pr.value);
              const grantedRoleUsers = roleUsers.filter((u) => getGrantRole(u.username, inspectedApp.clientId) !== null);
              const percentage = roleUsers.length > 0 ? Math.round((grantedRoleUsers.length / roleUsers.length) * 100) : 0;
              const allGranted = roleUsers.length > 0 && grantedRoleUsers.length === roleUsers.length;

              return (
                <div key={pr.value} className="mx-role-row">
                  <div className="mx-role-name">
                    {pr.label}
                    <small>{grantedRoleUsers.length} / {roleUsers.length} granted ({percentage}%)</small>
                  </div>
                  <div className="mx-role-bar" role="img" aria-label={`${percentage}% granted`}>
                    <div className={percentage === 100 ? "full" : undefined} style={{ width: `${percentage}%` }} />
                  </div>
                  <div className="mx-role-actions">
                    <button
                      type="button"
                      className="iipe-btn primary"
                      disabled={batchBusy || roleUsers.length === 0 || allGranted}
                      onClick={() => executeGroupGrant(roleUsers, inspectedApp.clientId, true, pr.label, "USER")}
                    >
                      + Users
                    </button>
                    <button
                      type="button"
                      className="iipe-btn secondary mx-btn-admin"
                      disabled={batchBusy || roleUsers.length === 0}
                      onClick={() => executeGroupGrant(roleUsers, inspectedApp.clientId, true, pr.label, "APP_ADMIN")}
                    >
                      ⭐ Admins
                    </button>
                    <button
                      type="button"
                      className="iipe-btn danger"
                      disabled={batchBusy || grantedRoleUsers.length === 0}
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
      <div className="mx-card">
        <div className="mx-filters">
          <input
            type="search"
            className="iipe-input"
            placeholder={`Search ${users.length} users…`}
            aria-label="Search users"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select className="iipe-select" aria-label="Filter by primary role" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="ALL">All Roles</option>
            {PRIMARY_ROLES.map((pr) => (<option key={pr.value} value={pr.value}>{pr.label}</option>))}
          </select>
          <select
            className="iipe-select"
            aria-label="Filter by access status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
          >
            <option value="ALL">All Access Status</option>
            <option value="ADMIN">⭐ App Admins Only</option>
            <option value="USER">👤 Regular Users Only</option>
            <option value="UNAUTHORIZED">No Access Only</option>
          </select>
        </div>

        <div className="mx-table-wrap">
          <table className="iipe-table mx-table">
            <thead>
              <tr>
                <th className="mx-user-cell">User</th>
                <th>Role</th>
                <th>Department</th>
                <th className="mx-center">Access</th>
                <th className="mx-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="mx-center" style={{ padding: 24 }}>
                    <span className="iipe-muted">No users match the search and filter criteria.</span>
                  </td>
                </tr>
              ) : (
                displayedUsers.map((user) => {
                  const role = getGrantRole(user.username, inspectedApp.clientId);
                  const isGranted = role !== null;
                  const isAppAdmin = role === "APP_ADMIN";
                  const key = `${user.username.toLowerCase().trim()}:${inspectedApp.clientId.toLowerCase().trim()}`;
                  const isBusy = busyKeys.has(key) || batchBusy;
                  return (
                    <tr key={user.id}>
                      <td className="mx-user-cell">
                        <strong>{user.name}</strong>
                        <div className="muted-line">@{user.username}</div>
                      </td>
                      <td>
                        <span className="iipe-badge">{getRoleLabel(user.primaryRole)}</span>
                      </td>
                      <td>{user.departmentName || "—"}</td>
                      <td className="mx-center">
                        {isAppAdmin ? (
                          <span className="iipe-badge accent">⭐ Admin</span>
                        ) : isGranted ? (
                          <span className="iipe-badge">✓ User</span>
                        ) : (
                          <span className="iipe-muted">—</span>
                        )}
                      </td>
                      <td className="mx-center">
                        <div className="mx-actions">
                          {!isGranted ? (
                            <>
                              <button
                                type="button"
                                className="iipe-btn primary"
                                disabled={isBusy || !inspectedApp.enabled}
                                onClick={() => toggleSingle(user, inspectedApp, true, "USER")}
                              >
                                + User
                              </button>
                              <button
                                type="button"
                                className="iipe-btn secondary mx-btn-admin"
                                disabled={isBusy || !inspectedApp.enabled}
                                onClick={() => toggleSingle(user, inspectedApp, true, "APP_ADMIN")}
                              >
                                ⭐ Admin
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={`iipe-btn secondary${isAppAdmin ? "" : " mx-btn-admin"}`}
                                disabled={isBusy}
                                onClick={() => toggleSingle(user, inspectedApp, true, isAppAdmin ? "USER" : "APP_ADMIN")}
                                title={isAppAdmin ? "Demote to regular user" : "Promote to App Admin"}
                              >
                                {isAppAdmin ? "↓ User" : "⭐ Admin"}
                              </button>
                              <button
                                type="button"
                                className="iipe-btn danger"
                                disabled={isBusy}
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
        <div className="iipe-muted" style={{ marginTop: 8, fontSize: "0.8rem" }}>
          Showing {displayedUsers.length} of {users.length} users
        </div>
      </div>
    </div>
  );
}
