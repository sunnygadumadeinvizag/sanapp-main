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

export function AccessMatrixGrid({
  users,
  applications,
  initialGrants,
  departments,
  focusUsername,
}: {
  users: MatrixUser[];
  applications: MatrixApp[];
  initialGrants: MatrixGrant[];
  departments: DepartmentOption[];
  focusUsername?: string;
}) {
  const [grants, setGrants] = useState<MatrixGrant[]>(initialGrants);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "danger" | "info"; message: string } | null>(null);

  // Selection
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(
    focusUsername ? new Set([focusUsername]) : new Set()
  );
  const [batchSelectedApps, setBatchSelectedApps] = useState<Set<string>>(new Set());

  // Filter state
  const [searchQuery, setSearchQuery] = useState<string>(focusUsername ?? "");
  const [filterPrimaryRole, setFilterPrimaryRole] = useState<string>("ALL");
  const [filterDepartment, setFilterDepartment] = useState<string>("ALL");
  const [filterAppGrant, setFilterAppGrant] = useState<string>("ALL");
  const [filterSelectionOnly, setFilterSelectionOnly] = useState<boolean>(false);

  // Grant lookup
  const grantLookup = useMemo(() => {
    const set = new Set<string>();
    for (const g of grants) {
      set.add(`${g.username}:${g.clientId}`);
    }
    return set;
  }, [grants]);

  function hasGrant(username: string, clientId: string) {
    return grantLookup.has(`${username}:${clientId}`);
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
        const hasAny = applications.some((a) => grantLookup.has(`${u.username}:${a.clientId}`));
        if (!hasAny) return false;
      } else if (filterAppGrant === "NONE") {
        const hasAny = applications.some((a) => grantLookup.has(`${u.username}:${a.clientId}`));
        if (hasAny) return false;
      } else if (filterAppGrant.startsWith("HAS_")) {
        const cid = filterAppGrant.replace("HAS_", "");
        if (!grantLookup.has(`${u.username}:${cid}`)) return false;
      } else if (filterAppGrant.startsWith("MISSING_")) {
        const cid = filterAppGrant.replace("MISSING_", "");
        if (grantLookup.has(`${u.username}:${cid}`)) return false;
      }

      if (filterSelectionOnly && !selectedUsernames.has(u.username)) return false;

      return true;
    });
  }, [users, searchQuery, filterPrimaryRole, filterDepartment, filterAppGrant, filterSelectionOnly, selectedUsernames, grantLookup, applications]);

  // Statistics
  const appStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of applications) counts[a.clientId] = 0;
    for (const g of grants) {
      if (counts[g.clientId] !== undefined) counts[g.clientId] += 1;
    }
    return counts;
  }, [applications, grants]);

  // Single Toggle
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
      setFeedback({ type: "danger", message: `Failed to update access for @${user.username} on ${app.name}` });
    } finally {
      setBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  // Batch execution
  async function executeBatch(action: "grant" | "revoke" | "set_exact" | "grant_all" | "revoke_all") {
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

    const apiAction = action === "grant_all" ? "grant" : action === "revoke_all" ? "revoke" : action;

    try {
      const res = await fetch(apiPath("/api/grants/batch"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: apiAction,
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
              updated.push({ userId: u.id, username: u.username, clientId: cid });
            }
          }
        } else if (apiAction === "grant") {
          for (const u of selectedUsersList) {
            for (const cid of targetClientIds) {
              if (!updated.some((g) => g.username === u.username && g.clientId === cid)) {
                updated.push({ userId: u.id, username: u.username, clientId: cid });
              }
            }
          }
        }
        return updated;
      });

      const actionText =
        action === "grant" || action === "grant_all"
          ? "Granted"
          : action === "revoke" || action === "revoke_all"
          ? "Revoked"
          : "Synchronized";
      setFeedback({
        type: "success",
        message: `Successfully ${actionText} access for ${selectedUsersList.length} user(s) across ${targetClientIds.length} app(s).`,
      });
    } catch (err: any) {
      setFeedback({ type: "danger", message: err.message || "Failed to execute batch update." });
    } finally {
      setBatchBusy(false);
    }
  }

  // Selection helpers
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

  function handleInvertSelection() {
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => {
        if (next.has(u.username)) next.delete(u.username);
        else next.add(u.username);
      });
      return next;
    });
  }

  function toggleUserSelection(username: string) {
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }

  // CSV Export
  function exportCSV() {
    const headers = ["User ID", "Username", "Name", "Email", "Primary Role", "Department", "Designation", ...applications.map((a) => a.name)];
    const rows = filteredUsers.map((u) => [
      `"${u.id}"`,
      `"${u.username}"`,
      `"${u.name.replace(/"/g, '""')}"`,
      `"${u.email || ""}"`,
      `"${u.primaryRole}"`,
      `"${(u.departmentName || "").replace(/"/g, '""')}"`,
      `"${(u.designation || "").replace(/"/g, '""')}"`,
      ...applications.map((a) => (hasGrant(u.username, a.clientId) ? '"YES"' : '"NO"')),
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `iipe_access_matrix_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div>
      {/* Toast Feedback Alert */}
      {feedback && (
        <div
          className={`iipe-alert ${feedback.type}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            className="iipe-btn secondary"
            style={{ padding: "2px 8px", fontSize: "0.8rem", marginLeft: 12 }}
            onClick={() => setFeedback(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ background: "var(--iipe-surface)", border: "1px solid var(--iipe-border)", borderRadius: "var(--iipe-radius)", padding: "12px 16px" }}>
          <div className="iipe-muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 600 }}>Total Users</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4 }}>{users.length}</div>
        </div>

        <div style={{ background: "var(--iipe-surface)", border: "1px solid var(--iipe-border)", borderRadius: "var(--iipe-radius)", padding: "12px 16px" }}>
          <div className="iipe-muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 600 }}>Applications</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4 }}>{applications.length}</div>
        </div>

        <div style={{ background: "var(--iipe-surface)", border: "1px solid var(--iipe-border)", borderRadius: "var(--iipe-radius)", padding: "12px 16px" }}>
          <div className="iipe-muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 600 }}>Total Grants</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4, color: "var(--iipe-primary)" }}>{grants.length}</div>
        </div>

        <div style={{ background: "var(--iipe-surface)", border: "1px solid var(--iipe-border)", borderRadius: "var(--iipe-radius)", padding: "12px 16px" }}>
          <div className="iipe-muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 600 }}>Selected Users</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4, color: selectedUsernames.size > 0 ? "var(--iipe-accent)" : "inherit" }}>
            {selectedUsernames.size} <span style={{ fontSize: "0.85rem", fontWeight: 400, color: "var(--iipe-muted)" }}>of {filteredUsers.length} shown</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        style={{
          background: "var(--iipe-bg)",
          border: "1px solid var(--iipe-border)",
          borderRadius: "var(--iipe-radius)",
          padding: "16px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Search Users</label>
            <input
              type="text"
              className="iipe-input"
              placeholder="Name, username, email, roll/emp no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: "100%", height: 38 }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Primary Role</label>
            <select
              className="iipe-select"
              value={filterPrimaryRole}
              onChange={(e) => setFilterPrimaryRole(e.target.value)}
              style={{ width: "100%", height: 38 }}
            >
              <option value="ALL">All Roles ({users.length})</option>
              {PRIMARY_ROLES.map((pr) => (
                <option key={pr.value} value={pr.value}>
                  {pr.label} ({users.filter((u) => u.primaryRole === pr.value).length})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>Department / Section</label>
            <select
              className="iipe-select"
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              style={{ width: "100%", height: 38 }}
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>App Access Status</label>
            <select
              className="iipe-select"
              value={filterAppGrant}
              onChange={(e) => setFilterAppGrant(e.target.value)}
              style={{ width: "100%", height: 38 }}
            >
              <option value="ALL">All Users</option>
              <option value="ANY">Has At Least 1 App</option>
              <option value="NONE">Has Zero Apps (No Access)</option>
              <optgroup label="Has Access to Specific App">
                {applications.map((a) => (
                  <option key={`has_${a.clientId}`} value={`HAS_${a.clientId}`}>Has: {a.name}</option>
                ))}
              </optgroup>
              <optgroup label="Missing Access to Specific App">
                {applications.map((a) => (
                  <option key={`missing_${a.clientId}`} value={`MISSING_${a.clientId}`}>Missing: {a.name}</option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid var(--iipe-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Selection ({selectedUsernames.size}):</span>
            <button type="button" className="iipe-btn secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={handleSelectAllFiltered}>
              Select All Filtered ({filteredUsers.length})
            </button>
            <button type="button" className="iipe-btn secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={handleInvertSelection}>
              Invert
            </button>
            {selectedUsernames.size > 0 && (
              <button type="button" className="iipe-btn secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={handleDeselectAll}>
                Clear Selection
              </button>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", marginLeft: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={filterSelectionOnly} onChange={(e) => setFilterSelectionOnly(e.target.checked)} />
              Show selected only
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {(searchQuery || filterPrimaryRole !== "ALL" || filterDepartment !== "ALL" || filterAppGrant !== "ALL" || filterSelectionOnly) && (
              <button
                type="button"
                className="iipe-btn secondary"
                style={{ padding: "4px 10px", fontSize: "0.8rem" }}
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
            <button type="button" className="iipe-btn secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={exportCSV}>
              📥 Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Sticky Batch Toolbar */}
      {selectedUsernames.size > 0 && (
        <div
          style={{
            background: "var(--iipe-surface)",
            border: "2px solid var(--iipe-primary)",
            borderRadius: "var(--iipe-radius)",
            padding: "16px 20px",
            marginBottom: 20,
            boxShadow: "var(--iipe-shadow)",
            position: "sticky",
            top: "calc(var(--iipe-header-height) + 10px)",
            zIndex: 40,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <span
                style={{
                  display: "inline-block",
                  background: "var(--iipe-primary)",
                  color: "#fff",
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  marginRight: 10,
                }}
              >
                {selectedUsernames.size} Users Selected
              </span>
              <span className="iipe-muted" style={{ fontSize: "0.88rem" }}>
                Choose application(s) to grant or revoke in bulk:
              </span>
            </div>

            <button type="button" className="iipe-btn secondary" style={{ padding: "4px 12px", fontSize: "0.8rem" }} onClick={handleDeselectAll}>
              Deselect All
            </button>
          </div>

          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, marginRight: 4 }}>Target Apps:</span>
            <button
              type="button"
              className="iipe-btn secondary"
              style={{
                padding: "3px 10px",
                fontSize: "0.78rem",
                background: batchSelectedApps.size === applications.length ? "var(--iipe-primary-light)" : undefined,
                borderColor: batchSelectedApps.size === applications.length ? "var(--iipe-primary)" : undefined,
              }}
              onClick={() => {
                if (batchSelectedApps.size === applications.length) setBatchSelectedApps(new Set());
                else setBatchSelectedApps(new Set(applications.map((a) => a.clientId)));
              }}
            >
              {batchSelectedApps.size === applications.length ? "✓ All Apps Picked" : "Select All Apps"}
            </button>

            {applications.map((app) => {
              const isPicked = batchSelectedApps.has(app.clientId);
              return (
                <button
                  key={app.clientId}
                  type="button"
                  onClick={() => {
                    setBatchSelectedApps((prev) => {
                      const next = new Set(prev);
                      if (next.has(app.clientId)) next.delete(app.clientId);
                      else next.add(app.clientId);
                      return next;
                    });
                  }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    border: isPicked ? "1.5px solid var(--iipe-primary)" : "1px solid var(--iipe-border)",
                    background: isPicked ? "var(--iipe-primary)" : "var(--iipe-surface)",
                    color: isPicked ? "#fff" : "var(--iipe-text)",
                    fontWeight: isPicked ? 600 : 400,
                  }}
                >
                  {isPicked ? "✓ " : "+ "}
                  {app.name}
                </button>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              paddingTop: 12,
              borderTop: "1px dashed var(--iipe-border)",
            }}
          >
            <button
              type="button"
              className="iipe-btn primary"
              disabled={batchBusy || batchSelectedApps.size === 0}
              onClick={() => executeBatch("grant")}
              style={{ minWidth: 160 }}
            >
              {batchBusy ? "Processing..." : `+ Grant Selected (${batchSelectedApps.size})`}
            </button>

            <button
              type="button"
              className="iipe-btn danger"
              disabled={batchBusy || batchSelectedApps.size === 0}
              onClick={() => executeBatch("revoke")}
              style={{ minWidth: 160 }}
            >
              {batchBusy ? "Processing..." : `- Revoke Selected (${batchSelectedApps.size})`}
            </button>

            <button
              type="button"
              className="iipe-btn secondary"
              disabled={batchBusy || batchSelectedApps.size === 0}
              onClick={() => {
                if (window.confirm(`Set EXACT access for ${selectedUsernames.size} users to ONLY have the ${batchSelectedApps.size} selected app(s)?`)) {
                  executeBatch("set_exact");
                }
              }}
            >
              🔄 Sync Exact Apps
            </button>

            <span className="iipe-spacer" />

            <button
              type="button"
              className="iipe-btn secondary"
              disabled={batchBusy}
              onClick={() => {
                if (window.confirm(`Grant ALL enabled apps to ${selectedUsernames.size} selected user(s)?`)) {
                  executeBatch("grant_all");
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

      {/* Grid Table */}
      <div className="iipe-table-scroll" style={{ maxHeight: "75vh", overflowY: "auto", border: "1px solid var(--iipe-border)", borderRadius: "var(--iipe-radius)" }}>
        <table className="iipe-table" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--iipe-surface)" }}>
            <tr>
              <th style={{ width: 40, textAlign: "center", borderBottom: "2px solid var(--iipe-border)" }}>
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedUsernames.has(u.username))}
                  onChange={(e) => {
                    if (e.target.checked) handleSelectAllFiltered();
                    else handleDeselectAll();
                  }}
                  style={{ width: 17, height: 17, cursor: "pointer" }}
                />
              </th>
              <th style={{ minWidth: 260, borderBottom: "2px solid var(--iipe-border)" }}>User &amp; Department</th>
              <th style={{ minWidth: 150, borderBottom: "2px solid var(--iipe-border)" }}>Primary Role</th>
              {applications.map((app) => {
                const count = appStats[app.clientId] || 0;
                return (
                  <th key={app.clientId} style={{ textAlign: "center", minWidth: 120, borderBottom: "2px solid var(--iipe-border)", padding: "10px 8px" }}>
                    <div style={{ fontWeight: 700 }}>{app.name}</div>
                    <div style={{ fontSize: "0.72rem", marginTop: 2, fontWeight: 400, color: "var(--iipe-muted)" }}>
                      <span style={{ background: "var(--iipe-primary-light)", color: "var(--iipe-primary-dark)", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>
                        {count} / {users.length}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={3 + applications.length} style={{ textAlign: "center", padding: "36px 16px" }}>
                  <div className="iipe-muted" style={{ fontSize: "1rem" }}>No users match the selected filters.</div>
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const isSelected = selectedUsernames.has(user.username);
                const isFocused = focusUsername === user.username;
                return (
                  <tr
                    key={user.id}
                    style={{
                      background: isSelected
                        ? "var(--iipe-primary-light)"
                        : isFocused
                        ? "color-mix(in srgb, var(--iipe-accent) 15%, transparent)"
                        : undefined,
                    }}
                  >
                    <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleUserSelection(user.username)}
                        aria-label={`Select ${user.name}`}
                        style={{ width: 17, height: 17, cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ verticalAlign: "middle" }}>
                      <div style={{ fontWeight: 600 }}>{user.name}</div>
                      <div className="iipe-muted" style={{ fontSize: "0.8rem" }}>
                        @{user.username} {user.email && `• ${user.email}`}
                      </div>
                      {user.departmentName && (
                        <div style={{ fontSize: "0.75rem", color: "var(--iipe-muted)", marginTop: 2 }}>
                          🏛️ {user.departmentName}
                          {user.designation && ` — ${user.designation}`}
                        </div>
                      )}
                    </td>
                    <td style={{ verticalAlign: "middle" }}>
                      <span className="iipe-badge" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                        {getRoleLabel(user.primaryRole)}
                      </span>
                      {!user.isActive && (
                        <span className="iipe-badge danger" style={{ fontSize: "0.7rem", marginLeft: 4 }}>
                          Inactive
                        </span>
                      )}
                    </td>
                    {applications.map((app) => {
                      const checked = hasGrant(user.username, app.clientId);
                      const cellKey = `${user.username}:${app.clientId}`;
                      const isBusy = busyKeys.has(cellKey) || batchBusy;
                      const disabled = isBusy || !app.enabled;
                      return (
                        <td
                          key={app.clientId}
                          style={{
                            textAlign: "center",
                            verticalAlign: "middle",
                            background: checked ? "color-mix(in srgb, var(--iipe-primary) 6%, transparent)" : undefined,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={(e) => toggleSingle(user, app, e.target.checked)}
                            aria-label={`${user.name} — ${app.name}`}
                            style={{
                              width: 19,
                              height: 19,
                              cursor: disabled ? "not-allowed" : "pointer",
                              accentColor: "var(--iipe-primary)",
                            }}
                          />
                        </td>
                      );
                    })}
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
