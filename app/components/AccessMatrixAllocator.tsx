"use client";

import { useMemo, useState } from "react";
import { apiPath } from "sanapp-common-ui";
import {
  MatrixUser,
  MatrixApp,
  MatrixGrant,
  DepartmentOption,
  PRIMARY_ROLES,
  getRoleLabel,
} from "./matrixTypes";
import "../admin-console/app-matrix/matrix.css";

export function AccessMatrixAllocator({
  users,
  applications,
  initialGrants,
  departments,
  initialRole,
}: {
  users: MatrixUser[];
  applications: MatrixApp[];
  initialGrants: MatrixGrant[];
  departments: DepartmentOption[];
  initialRole?: string;
}) {
  const [grants, setGrants] = useState<MatrixGrant[]>(initialGrants);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "danger" | "info"; message: string } | null>(null);

  // Selection
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(new Set());
  const [batchSelectedApps, setBatchSelectedApps] = useState<Set<string>>(new Set());

  // Filter state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterPrimaryRole, setFilterPrimaryRole] = useState<string>(initialRole ?? "ALL");
  const [filterDepartment, setFilterDepartment] = useState<string>("ALL");
  const [filterAppGrant, setFilterAppGrant] = useState<string>("ALL");
  const [filterSelectionOnly, setFilterSelectionOnly] = useState<boolean>(false);

  // Lookup
  const grantMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of grants) map.set(`${g.username}:${g.clientId}`, g.role || "USER");
    return map;
  }, [grants]);

  function getGrantRole(username: string, clientId: string): string | null {
    return grantMap.get(`${username}:${clientId}`) ?? null;
  }

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          u.name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.empNo && u.empNo.toLowerCase().includes(q)) ||
          (u.rollNo && u.rollNo.toLowerCase().includes(q)) ||
          (u.designation && u.designation.toLowerCase().includes(q));
        if (!matches) return false;
      }

      if (filterPrimaryRole !== "ALL" && u.primaryRole !== filterPrimaryRole) return false;
      if (filterDepartment !== "ALL" && u.departmentId !== filterDepartment && u.departmentName !== filterDepartment) return false;

      if (filterAppGrant === "ANY") {
        const hasAny = applications.some((a) => grantMap.has(`${u.username}:${a.clientId}`));
        if (!hasAny) return false;
      } else if (filterAppGrant === "NONE") {
        const hasAny = applications.some((a) => grantMap.has(`${u.username}:${a.clientId}`));
        if (hasAny) return false;
      } else if (filterAppGrant.startsWith("HAS_ADMIN_")) {
        const cid = filterAppGrant.replace("HAS_ADMIN_", "");
        if (grantMap.get(`${u.username}:${cid}`) !== "APP_ADMIN") return false;
      } else if (filterAppGrant.startsWith("HAS_")) {
        const cid = filterAppGrant.replace("HAS_", "");
        if (!grantMap.has(`${u.username}:${cid}`)) return false;
      } else if (filterAppGrant.startsWith("MISSING_")) {
        const cid = filterAppGrant.replace("MISSING_", "");
        if (grantMap.has(`${u.username}:${cid}`)) return false;
      }

      if (filterSelectionOnly && !selectedUsernames.has(u.username)) return false;

      return true;
    });
  }, [users, searchQuery, filterPrimaryRole, filterDepartment, filterAppGrant, filterSelectionOnly, selectedUsernames, grantMap, applications]);

  // Single Toggle
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
        credentials: "same-origin",
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

  // Batch execution
  async function executeBatch(
    action: "grant" | "revoke" | "set_exact" | "grant_all" | "revoke_all" | "set_role",
    targetRole: "USER" | "APP_ADMIN" = "USER"
  ) {
    if (selectedUsernames.size === 0) {
      setFeedback({ type: "info", message: "Please select at least one user first." });
      return;
    }

    const selectedUsersList = users.filter((u) => selectedUsernames.has(u.username));
    let targetClientIds: string[] = [];

    if (action === "grant_all" || action === "revoke_all") {
      targetClientIds = applications.filter((a) => a.enabled).map((a) => a.clientId);
    } else {
      targetClientIds = Array.from(batchSelectedApps);
    }

    if (targetClientIds.length === 0 && action !== "revoke_all") {
      setFeedback({ type: "info", message: "Please select at least one application." });
      return;
    }

    setBatchBusy(true);
    setFeedback(null);

    const apiAction =
      action === "grant_all" ? "grant" : action === "revoke_all" ? "revoke" : action;

    try {
      const res = await fetch(apiPath("/api/grants/batch"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: apiAction,
          role: targetRole,
          users: selectedUsersList.map((u) => ({ userId: u.id, username: u.username })),
          clientIds: targetClientIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Batch operation failed");
      }

      setGrants((prev) => {
        let updated = [...prev];
        const selectedUserSet = new Set(selectedUsersList.map((u) => u.username));
        const targetCidSet = new Set(targetClientIds);

        if (apiAction === "revoke") {
          updated = updated.filter((g) => !(selectedUserSet.has(g.username) && targetCidSet.has(g.clientId)));
        } else if (apiAction === "set_exact") {
          updated = updated.filter((g) => !selectedUserSet.has(g.username));
          for (const u of selectedUsersList) {
            for (const cid of targetClientIds) {
              updated.push({ userId: u.id, username: u.username, clientId: cid, role: targetRole });
            }
          }
        } else if (apiAction === "grant" || apiAction === "set_role") {
          for (const u of selectedUsersList) {
            for (const cid of targetClientIds) {
              const idx = updated.findIndex((g) => g.username === u.username && g.clientId === cid);
              if (idx >= 0) {
                updated[idx] = { ...updated[idx], role: targetRole };
              } else {
                updated.push({ userId: u.id, username: u.username, clientId: cid, role: targetRole });
              }
            }
          }
        }
        return updated;
      });

      const roleStr = targetRole === "APP_ADMIN" ? " as APP_ADMIN" : "";
      setFeedback({
        type: "success",
        message: `Successfully updated ${selectedUsersList.length} user(s) across ${targetClientIds.length} app(s)${roleStr}.`,
      });
    } catch (err: any) {
      setFeedback({ type: "danger", message: err.message || "Failed to execute batch update." });
    } finally {
      setBatchBusy(false);
    }
  }

  function handleSelectAllFiltered() {
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => next.add(u.username));
      return next;
    });
  }

  function handleDeselectAll() {
    setSelectedUsernames(new Set());
  }

  function toggleUserSelection(username: string) {
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }

  const filtersActive =
    !!searchQuery || filterPrimaryRole !== "ALL" || filterDepartment !== "ALL" || filterAppGrant !== "ALL" || filterSelectionOnly;

  return (
    <div className="mx-root">
      {/* Feedback Toast */}
      {feedback && (
        <div className={`iipe-alert ${feedback.type} mx-toast`} role="status">
          <span>{feedback.message}</span>
          <button type="button" className="iipe-btn secondary" aria-label="Dismiss" onClick={() => setFeedback(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Role Quick Selector */}
      <div>
        <div className="mx-card-title" style={{ marginBottom: 8 }}>Select entire roles</div>
        <div className="mx-app-picker">
          {PRIMARY_ROLES.map((pr) => {
            const roleUsers = users.filter((u) => u.primaryRole === pr.value);
            const allSelected = roleUsers.length > 0 && roleUsers.every((u) => selectedUsernames.has(u.username));
            return (
              <button
                key={pr.value}
                type="button"
                className={`mx-chip${allSelected ? " picked" : ""}`}
                aria-pressed={allSelected}
                onClick={() => {
                  setSelectedUsernames((prev) => {
                    const next = new Set(prev);
                    if (allSelected) roleUsers.forEach((u) => next.delete(u.username));
                    else roleUsers.forEach((u) => next.add(u.username));
                    return next;
                  });
                }}
              >
                {allSelected ? "✓" : "+"} {pr.label} ({roleUsers.length})
              </button>
            );
          })}
        </div>
      </div>

      {/* Batch Action Toolbar */}
      {selectedUsernames.size > 0 && (
        <div className="mx-batch">
          <div className="mx-batch-head">
            <div className="mx-batch-head-left">
              <span className="mx-batch-count">{selectedUsernames.size} selected</span>
              <span className="iipe-muted">Allocate as User or App Admin:</span>
            </div>
            <button type="button" className="iipe-btn secondary" onClick={handleDeselectAll}>
              Deselect All
            </button>
          </div>

          <div className="mx-app-picker">
            <span className="mx-app-picker-label">Apps:</span>
            <button
              type="button"
              className={`mx-chip${batchSelectedApps.size === applications.length ? " picked" : ""}`}
              onClick={() => {
                if (batchSelectedApps.size === applications.length) setBatchSelectedApps(new Set());
                else setBatchSelectedApps(new Set(applications.map((a) => a.clientId)));
              }}
            >
              {batchSelectedApps.size === applications.length ? "✓ All apps" : "All apps"}
            </button>
            {applications.map((app) => {
              const isPicked = batchSelectedApps.has(app.clientId);
              return (
                <button
                  key={app.clientId}
                  type="button"
                  className={`mx-chip${isPicked ? " picked" : ""}`}
                  aria-pressed={isPicked}
                  onClick={() => {
                    setBatchSelectedApps((prev) => {
                      const next = new Set(prev);
                      if (next.has(app.clientId)) next.delete(app.clientId);
                      else next.add(app.clientId);
                      return next;
                    });
                  }}
                >
                  {isPicked ? "✓" : "+"} {app.name}
                </button>
              );
            })}
          </div>

          <div className="mx-batch-actions">
            <button
              type="button"
              className="iipe-btn primary"
              disabled={batchBusy || batchSelectedApps.size === 0}
              onClick={() => executeBatch("grant", "USER")}
            >
              {batchBusy ? "Processing…" : `+ Grant as User (${batchSelectedApps.size})`}
            </button>

            <button
              type="button"
              className="iipe-btn secondary mx-btn-admin"
              disabled={batchBusy || batchSelectedApps.size === 0}
              onClick={() => executeBatch("set_role", "APP_ADMIN")}
            >
              {batchBusy ? "Processing…" : `⭐ Make App Admin (${batchSelectedApps.size})`}
            </button>

            <button
              type="button"
              className="iipe-btn danger"
              disabled={batchBusy || batchSelectedApps.size === 0}
              onClick={() => executeBatch("revoke")}
            >
              {batchBusy ? "Processing…" : `− Revoke (${batchSelectedApps.size})`}
            </button>

            <span className="iipe-spacer" />

            <button
              type="button"
              className="iipe-btn secondary"
              disabled={batchBusy}
              onClick={() => {
                if (window.confirm(`Grant ALL enabled apps to ${selectedUsernames.size} selected user(s)?`)) {
                  executeBatch("grant_all", "USER");
                }
              }}
            >
              Grant All Apps
            </button>

            <button
              type="button"
              className="iipe-btn secondary"
              disabled={batchBusy}
              onClick={() => {
                if (window.confirm(`Revoke ALL apps from ${selectedUsernames.size} selected user(s)?`)) {
                  executeBatch("revoke_all");
                }
              }}
            >
              Revoke All Apps
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="mx-card">
        <div className="mx-filters">
          <input
            type="search"
            className="iipe-input"
            placeholder="Search name, username, email, emp/roll no…"
            aria-label="Search users"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select className="iipe-select" aria-label="Filter by primary role" value={filterPrimaryRole} onChange={(e) => setFilterPrimaryRole(e.target.value)}>
            <option value="ALL">All Roles ({users.length})</option>
            {PRIMARY_ROLES.map((pr) => (
              <option key={pr.value} value={pr.value}>{pr.label} ({users.filter((u) => u.primaryRole === pr.value).length})</option>
            ))}
          </select>
          <select className="iipe-select" aria-label="Filter by department" value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)}>
            <option value="ALL">All Departments</option>
            {departments.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
          </select>
          <select className="iipe-select" aria-label="Filter by app access" value={filterAppGrant} onChange={(e) => setFilterAppGrant(e.target.value)}>
            <option value="ALL">All Users</option>
            <option value="ANY">Has At Least 1 App</option>
            <option value="NONE">Has Zero Apps (No Access)</option>
            <optgroup label="App Admin of">
              {applications.map((a) => (<option key={`has_admin_${a.clientId}`} value={`HAS_ADMIN_${a.clientId}`}>⭐ Admin of: {a.name}</option>))}
            </optgroup>
            <optgroup label="Has Access to">
              {applications.map((a) => (<option key={`has_${a.clientId}`} value={`HAS_${a.clientId}`}>Access: {a.name}</option>))}
            </optgroup>
            <optgroup label="Missing Access to">
              {applications.map((a) => (<option key={`missing_${a.clientId}`} value={`MISSING_${a.clientId}`}>Missing: {a.name}</option>))}
            </optgroup>
          </select>
        </div>

        <div className="mx-filter-row">
          <button type="button" className="iipe-btn secondary" onClick={handleSelectAllFiltered}>
            Select All Filtered ({filteredUsers.length})
          </button>
          {selectedUsernames.size > 0 && (
            <button type="button" className="iipe-btn secondary" onClick={handleDeselectAll}>
              Clear Selection
            </button>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", marginLeft: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={filterSelectionOnly} onChange={(e) => setFilterSelectionOnly(e.target.checked)} />
            Show selected only
          </label>
          <span className="iipe-spacer" />
          {filtersActive && (
            <button
              type="button"
              className="iipe-btn secondary"
              onClick={() => {
                setSearchQuery("");
                setFilterPrimaryRole("ALL");
                setFilterDepartment("ALL");
                setFilterAppGrant("ALL");
                setFilterSelectionOnly(false);
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* User Table with App Pills and Roles */}
      <div className="mx-table-wrap">
        <table className="iipe-table mx-table">
          <thead>
            <tr>
              <th className="mx-center">
                <input
                  type="checkbox"
                  className="mx-check"
                  aria-label="Select all"
                  checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedUsernames.has(u.username))}
                  onChange={(e) => {
                    if (e.target.checked) handleSelectAllFiltered();
                    else handleDeselectAll();
                  }}
                />
              </th>
              <th className="mx-user-cell">User</th>
              <th>Role &amp; Department</th>
              <th>Granted Applications</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="mx-center" style={{ padding: "32px 16px" }}>
                  <span className="iipe-muted">No users found matching current filters.</span>
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const isSelected = selectedUsernames.has(user.username);
                const userGrantedApps = applications
                  .map((a) => {
                    const r = getGrantRole(user.username, a.clientId);
                    return r ? { app: a, role: r } : null;
                  })
                  .filter(Boolean) as { app: MatrixApp; role: string }[];

                return (
                  <tr key={user.id} style={isSelected ? { background: "var(--iipe-primary-light)" } : undefined}>
                    <td className="mx-center">
                      <input
                        type="checkbox"
                        className="mx-check"
                        checked={isSelected}
                        onChange={() => toggleUserSelection(user.username)}
                        aria-label={`Select ${user.name}`}
                      />
                    </td>
                    <td className="mx-user-cell">
                      <strong>{user.name}</strong>
                      <div className="muted-line">@{user.username}</div>
                      {(user.empNo || user.rollNo) && (
                        <div className="muted-line">{user.empNo ? `Emp ${user.empNo}` : `Roll ${user.rollNo}`}</div>
                      )}
                    </td>
                    <td>
                      <span className="iipe-badge">{getRoleLabel(user.primaryRole)}</span>
                      {user.departmentName && (
                        <div className="muted-line">{user.departmentName}</div>
                      )}
                    </td>
                    <td>
                      {userGrantedApps.length === 0 ? (
                        <span className="iipe-muted">—</span>
                      ) : (
                        <div className="mx-grant-pills">
                          {userGrantedApps.map(({ app, role }) => {
                            const isAppAdmin = role === "APP_ADMIN";
                            const isBusy = busyKeys.has(`${user.username}:${app.clientId}`) || batchBusy;
                            return (
                              <span key={app.clientId} className={`mx-grant-pill${isAppAdmin ? " admin" : ""}`}>
                                <span>{isAppAdmin ? "⭐ " : ""}{app.name}</span>
                                <button
                                  type="button"
                                  className="promote"
                                  disabled={isBusy}
                                  onClick={() => toggleSingle(user, app, true, isAppAdmin ? "USER" : "APP_ADMIN")}
                                  title={isAppAdmin ? "Demote to regular User" : "Promote to App Admin"}
                                >
                                  {isAppAdmin ? "User" : "★"}
                                </button>
                                <button
                                  type="button"
                                  className="revoke"
                                  disabled={isBusy}
                                  onClick={() => toggleSingle(user, app, false)}
                                  title={`Revoke ${app.name}`}
                                  aria-label={`Revoke ${app.name}`}
                                >
                                  ✕
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
