"use client";

import { useMemo, useState } from "react";
import { apiPath } from "sanapp-common-ui";

export type MatrixUser = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  primaryRole: string;
  departmentId: string | null;
  departmentName: string | null;
  designation: string | null;
  empNo: string | null;
  rollNo: string | null;
  phone: string | null;
  isActive: boolean;
};

export type MatrixApp = {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  url: string;
  category: string;
  enabled: boolean;
};

export type MatrixGrant = {
  userId: string | null;
  username: string;
  clientId: string;
};

export type DepartmentOption = {
  id: string;
  name: string;
};

const PRIMARY_ROLES: { value: string; label: string; badgeColor: string }[] = [
  { value: "STAFF_TEACHING", label: "Staff (Teaching)", badgeColor: "#0b5d4f" },
  { value: "STAFF_NON_TEACHING", label: "Staff (Non-Teaching)", badgeColor: "#1a5d8f" },
  { value: "STUDENT", label: "Student", badgeColor: "#9a6b00" },
  { value: "SCHOLAR", label: "Scholar", badgeColor: "#6b3ba7" },
  { value: "GUEST", label: "Guest", badgeColor: "#5f6f6b" },
];

function getRoleLabel(roleKey: string) {
  const r = PRIMARY_ROLES.find((pr) => pr.value === roleKey);
  return r ? r.label : roleKey;
}

export function AccessMatrix({
  users,
  applications,
  initialGrants,
  departments,
  focusUsername,
  initialApp,
  initialRole,
}: {
  users: MatrixUser[];
  applications: MatrixApp[];
  initialGrants: MatrixGrant[];
  departments: DepartmentOption[];
  focusUsername?: string;
  initialApp?: string;
  initialRole?: string;
}) {
  // Navigation / View modes
  const [activeTab, setActiveTab] = useState<"matrix" | "allocator" | "inspector">(
    initialApp ? "inspector" : initialRole ? "allocator" : "matrix"
  );

  // Grants state
  const [grants, setGrants] = useState<MatrixGrant[]>(initialGrants);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "danger" | "info"; message: string } | null>(null);

  // Selection state (selected usernames)
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(
    focusUsername ? new Set([focusUsername]) : new Set()
  );

  // Batch action targeted apps
  const [batchSelectedApps, setBatchSelectedApps] = useState<Set<string>>(
    initialApp ? new Set([initialApp]) : new Set()
  );

  // Inspector selected app
  const [inspectedAppClientId, setInspectedAppClientId] = useState<string>(
    initialApp && applications.some((a) => a.clientId === initialApp)
      ? initialApp
      : applications[0]?.clientId ?? ""
  );

  // Filtering state
  const [searchQuery, setSearchQuery] = useState<string>(focusUsername ?? "");
  const [filterPrimaryRole, setFilterPrimaryRole] = useState<string>(initialRole ?? "ALL");
  const [filterSystemRole, setFilterSystemRole] = useState<string>("ALL");
  const [filterDepartment, setFilterDepartment] = useState<string>("ALL");
  const [filterActiveStatus, setFilterActiveStatus] = useState<string>("ALL");
  const [filterAppGrant, setFilterAppGrant] = useState<string>("ALL");
  const [filterSelectionOnly, setFilterSelectionOnly] = useState<boolean>(false);

  // Fast grant lookup: Set of "username:clientId"
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

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Search query
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

      // Primary role filter
      if (filterPrimaryRole !== "ALL" && u.primaryRole !== filterPrimaryRole) {
        return false;
      }

      // System role filter
      if (filterSystemRole !== "ALL" && u.role !== filterSystemRole) {
        return false;
      }

      // Department filter
      if (filterDepartment !== "ALL" && u.departmentId !== filterDepartment && u.departmentName !== filterDepartment) {
        return false;
      }

      // Active status filter
      if (filterActiveStatus === "ACTIVE" && !u.isActive) return false;
      if (filterActiveStatus === "INACTIVE" && u.isActive) return false;

      // App access filter
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

      // Selection only
      if (filterSelectionOnly && !selectedUsernames.has(u.username)) {
        return false;
      }

      return true;
    });
  }, [
    users,
    searchQuery,
    filterPrimaryRole,
    filterSystemRole,
    filterDepartment,
    filterActiveStatus,
    filterAppGrant,
    filterSelectionOnly,
    selectedUsernames,
    grantLookup,
    applications,
  ]);

  // Statistics
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const totalGrants = grants.length;
    const appStats: Record<string, number> = {};
    for (const a of applications) {
      appStats[a.clientId] = 0;
    }
    for (const g of grants) {
      if (appStats[g.clientId] !== undefined) {
        appStats[g.clientId] += 1;
      }
    }
    return { totalUsers, totalGrants, appStats };
  }, [users, grants, applications]);

  // Toggle single cell grant
  async function toggleSingle(user: MatrixUser, app: MatrixApp, checked: boolean) {
    const key = `${user.username}:${app.clientId}`;
    setBusyKeys((prev) => new Set(prev).add(key));
    setFeedback(null);

    // Optimistic update
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
      // Rollback on failure
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

  // Batch grant/revoke/sync execution
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
      setFeedback({ type: "info", message: "Please select at least one application to allocate." });
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

      // Update local grants state
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

  // Quick Role/Department grant in Inspector
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

      const appName = applications.find((a) => a.clientId === clientId)?.name ?? clientId;
      setFeedback({
        type: "success",
        message: `${grant ? "Granted" : "Revoked"} ${appName} for all ${userList.length} members of "${groupName}".`,
      });
    } catch {
      setFeedback({ type: "danger", message: `Failed to update ${groupName}. Please try again.` });
    } finally {
      setBatchBusy(false);
    }
  }

  // Selection handlers
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

  // Export Matrix CSV
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

  // Inspected App Details
  const inspectedApp = applications.find((a) => a.clientId === inspectedAppClientId) || applications[0];
  const inspectedAppGrantedUsers = useMemo(() => {
    if (!inspectedApp) return [];
    return users.filter((u) => hasGrant(u.username, inspectedApp.clientId));
  }, [inspectedApp, users, grantLookup]);

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
            animation: "fadeIn 0.2s ease-in-out",
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

      {/* Top Metrics / Overview Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: "var(--iipe-surface)",
            border: "1px solid var(--iipe-border)",
            borderRadius: "var(--iipe-radius)",
            padding: "12px 16px",
          }}
        >
          <div className="iipe-muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 600 }}>
            Total Users
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4 }}>
            {users.length}
          </div>
        </div>

        <div
          style={{
            background: "var(--iipe-surface)",
            border: "1px solid var(--iipe-border)",
            borderRadius: "var(--iipe-radius)",
            padding: "12px 16px",
          }}
        >
          <div className="iipe-muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 600 }}>
            Registered Apps
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4 }}>
            {applications.length}
          </div>
        </div>

        <div
          style={{
            background: "var(--iipe-surface)",
            border: "1px solid var(--iipe-border)",
            borderRadius: "var(--iipe-radius)",
            padding: "12px 16px",
          }}
        >
          <div className="iipe-muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 600 }}>
            Total Active Grants
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4, color: "var(--iipe-primary)" }}>
            {grants.length}
          </div>
        </div>

        <div
          style={{
            background: "var(--iipe-surface)",
            border: "1px solid var(--iipe-border)",
            borderRadius: "var(--iipe-radius)",
            padding: "12px 16px",
          }}
        >
          <div className="iipe-muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 600 }}>
            Selected Users
          </div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: 4, color: selectedUsernames.size > 0 ? "var(--iipe-accent)" : "inherit" }}>
            {selectedUsernames.size} <span style={{ fontSize: "0.85rem", fontWeight: 400, color: "var(--iipe-muted)" }}>of {filteredUsers.length} shown</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Header */}
      <div
        style={{
          display: "flex",
          gap: 8,
          borderBottom: "2px solid var(--iipe-border)",
          marginBottom: 20,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("matrix")}
          style={{
            padding: "10px 18px",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: "pointer",
            background: "none",
            border: "none",
            borderBottom: activeTab === "matrix" ? "3px solid var(--iipe-primary)" : "3px solid transparent",
            color: activeTab === "matrix" ? "var(--iipe-primary)" : "var(--iipe-muted)",
            marginBottom: -2,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>⊞</span> Access Matrix (Grid View)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("allocator")}
          style={{
            padding: "10px 18px",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: "pointer",
            background: "none",
            border: "none",
            borderBottom: activeTab === "allocator" ? "3px solid var(--iipe-primary)" : "3px solid transparent",
            color: activeTab === "allocator" ? "var(--iipe-primary)" : "var(--iipe-muted)",
            marginBottom: -2,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>⚡</span> User &amp; Role Allocator (Batch)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("inspector")}
          style={{
            padding: "10px 18px",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: "pointer",
            background: "none",
            border: "none",
            borderBottom: activeTab === "inspector" ? "3px solid var(--iipe-primary)" : "3px solid transparent",
            color: activeTab === "inspector" ? "var(--iipe-primary)" : "var(--iipe-muted)",
            marginBottom: -2,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>🔍</span> App Access Inspector
        </button>
      </div>

      {/* Shared Filter Bar (Available for Matrix and Allocator tabs) */}
      {activeTab !== "inspector" && (
        <div
          style={{
            background: "var(--iipe-bg)",
            border: "1px solid var(--iipe-border)",
            borderRadius: "var(--iipe-radius)",
            padding: "16px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              alignItems: "end",
            }}
          >
            {/* Search Input */}
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>
                Search Users
              </label>
              <input
                type="text"
                className="iipe-input"
                placeholder="Name, username, email, roll/emp no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: "100%", height: 38 }}
              />
            </div>

            {/* Primary Role Filter */}
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>
                Primary Role
              </label>
              <select
                className="iipe-select"
                value={filterPrimaryRole}
                onChange={(e) => setFilterPrimaryRole(e.target.value)}
                style={{ width: "100%", height: 38 }}
              >
                <option value="ALL">All Roles ({users.length})</option>
                {PRIMARY_ROLES.map((pr) => {
                  const count = users.filter((u) => u.primaryRole === pr.value).length;
                  return (
                    <option key={pr.value} value={pr.value}>
                      {pr.label} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Department Filter */}
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>
                Department / Section
              </label>
              <select
                className="iipe-select"
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                style={{ width: "100%", height: 38 }}
              >
                <option value="ALL">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* App Access Filter */}
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>
                App Access Status
              </label>
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
                    <option key={`has_${a.clientId}`} value={`HAS_${a.clientId}`}>
                      Has: {a.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Missing Access to Specific App">
                  {applications.map((a) => (
                    <option key={`missing_${a.clientId}`} value={`MISSING_${a.clientId}`}>
                      Missing: {a.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Quick Selection & Control Bar */}
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
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                Selection ({selectedUsernames.size} selected):
              </span>
              <button
                type="button"
                className="iipe-btn secondary"
                style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                onClick={handleSelectAllFiltered}
              >
                Select All Filtered ({filteredUsers.length})
              </button>
              <button
                type="button"
                className="iipe-btn secondary"
                style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                onClick={handleInvertSelection}
              >
                Invert
              </button>
              {selectedUsernames.size > 0 && (
                <button
                  type="button"
                  className="iipe-btn secondary"
                  style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                  onClick={handleDeselectAll}
                >
                  Clear Selection
                </button>
              )}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "0.8rem",
                  marginLeft: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={filterSelectionOnly}
                  onChange={(e) => setFilterSelectionOnly(e.target.checked)}
                />
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
              <button
                type="button"
                className="iipe-btn secondary"
                style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                onClick={exportCSV}
                title="Export current filtered view to CSV"
              >
                📥 Export CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating / Sticky Batch Action Bar when users are selected */}
      {selectedUsernames.size > 0 && activeTab !== "inspector" && (
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
                Choose application(s) below to allocate or revoke in bulk:
              </span>
            </div>

            <button
              type="button"
              className="iipe-btn secondary"
              style={{ padding: "4px 12px", fontSize: "0.8rem" }}
              onClick={handleDeselectAll}
            >
              Deselect All
            </button>
          </div>

          {/* Apps Multi-Selection Pills */}
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
                if (batchSelectedApps.size === applications.length) {
                  setBatchSelectedApps(new Set());
                } else {
                  setBatchSelectedApps(new Set(applications.map((a) => a.clientId)));
                }
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
                    transition: "all 0.15s ease",
                  }}
                >
                  {isPicked ? "✓ " : "+ "}
                  {app.name}
                </button>
              );
            })}
          </div>

          {/* Action Execution Buttons */}
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
              title="Replaces user access so they have ONLY the chosen apps"
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

      {/* ========================================================================= */}
      {/* TAB 1: ACCESS MATRIX (GRID VIEW)                                          */}
      {/* ========================================================================= */}
      {activeTab === "matrix" && (
        <div>
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
                  <th style={{ minWidth: 260, borderBottom: "2px solid var(--iipe-border)" }}>
                    User &amp; Department
                  </th>
                  <th style={{ minWidth: 150, borderBottom: "2px solid var(--iipe-border)" }}>
                    Primary Role
                  </th>
                  {applications.map((app) => {
                    const count = stats.appStats[app.clientId] || 0;
                    return (
                      <th
                        key={app.clientId}
                        style={{
                          textAlign: "center",
                          minWidth: 120,
                          borderBottom: "2px solid var(--iipe-border)",
                          padding: "10px 8px",
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{app.name}</div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            marginTop: 2,
                            fontWeight: 400,
                            color: "var(--iipe-muted)",
                          }}
                        >
                          <span
                            style={{
                              background: "var(--iipe-primary-light)",
                              color: "var(--iipe-primary-dark)",
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontWeight: 600,
                            }}
                          >
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
                      <div className="iipe-muted" style={{ fontSize: "1rem" }}>
                        No users match the selected filters.
                      </div>
                      <button
                        type="button"
                        className="iipe-btn secondary"
                        style={{ marginTop: 12 }}
                        onClick={() => {
                          setSearchQuery("");
                          setFilterPrimaryRole("ALL");
                          setFilterDepartment("ALL");
                          setFilterAppGrant("ALL");
                          setFilterSelectionOnly(false);
                        }}
                      >
                        Reset All Filters
                      </button>
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
                          transition: "background 0.12s ease",
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
                          <span
                            className="iipe-badge"
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 600,
                            }}
                          >
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
      )}

      {/* ========================================================================= */}
      {/* TAB 2: USER & ROLE ALLOCATOR (BATCH VIEW)                                 */}
      {/* ========================================================================= */}
      {activeTab === "allocator" && (
        <div>
          {/* Role Quick Selector Cards */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", color: "var(--iipe-muted)", marginBottom: 8 }}>
              Quick Select By Primary Role:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {PRIMARY_ROLES.map((pr) => {
                const roleUsers = users.filter((u) => u.primaryRole === pr.value);
                const allSelected = roleUsers.length > 0 && roleUsers.every((u) => selectedUsernames.has(u.username));
                return (
                  <div
                    key={pr.value}
                    style={{
                      background: "var(--iipe-surface)",
                      border: allSelected ? "2px solid var(--iipe-primary)" : "1px solid var(--iipe-border)",
                      borderRadius: "var(--iipe-radius)",
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flex: "1 1 200px",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{pr.label}</div>
                      <div className="iipe-muted" style={{ fontSize: "0.78rem" }}>
                        {roleUsers.length} Users
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`iipe-btn ${allSelected ? "primary" : "secondary"}`}
                      style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                      onClick={() => {
                        setSelectedUsernames((prev) => {
                          const next = new Set(prev);
                          if (allSelected) {
                            roleUsers.forEach((u) => next.delete(u.username));
                          } else {
                            roleUsers.forEach((u) => next.add(u.username));
                          }
                          return next;
                        });
                      }}
                    >
                      {allSelected ? "✓ Selected" : "+ Select Role"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* User List with Assigned Apps Pills */}
          <div className="iipe-table-scroll" style={{ maxHeight: "65vh", overflowY: "auto", border: "1px solid var(--iipe-border)", borderRadius: "var(--iipe-radius)" }}>
            <table className="iipe-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedUsernames.has(u.username))}
                      onChange={(e) => {
                        if (e.target.checked) handleSelectAllFiltered();
                        else handleDeselectAll();
                      }}
                      style={{ width: 17, height: 17, cursor: "pointer" }}
                    />
                  </th>
                  <th style={{ minWidth: 220 }}>User Details</th>
                  <th style={{ minWidth: 150 }}>Role &amp; Department</th>
                  <th>Currently Granted Applications</th>
                  <th style={{ width: 100, textAlign: "right" }}>Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "32px 16px" }}>
                      <div className="iipe-muted">No users found matching current filters.</div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelected = selectedUsernames.has(user.username);
                    const userGrantedApps = applications.filter((a) => hasGrant(user.username, a.clientId));
                    return (
                      <tr
                        key={user.id}
                        style={{
                          background: isSelected ? "var(--iipe-primary-light)" : undefined,
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
                          {user.empNo && <span className="iipe-badge" style={{ fontSize: "0.7rem", marginRight: 4 }}>Emp: {user.empNo}</span>}
                          {user.rollNo && <span className="iipe-badge" style={{ fontSize: "0.7rem", marginRight: 4 }}>Roll: {user.rollNo}</span>}
                        </td>
                        <td style={{ verticalAlign: "middle" }}>
                          <span className="iipe-badge" style={{ fontSize: "0.72rem", fontWeight: 600 }}>
                            {getRoleLabel(user.primaryRole)}
                          </span>
                          {user.departmentName && (
                            <div style={{ fontSize: "0.75rem", color: "var(--iipe-muted)", marginTop: 4 }}>
                              🏛️ {user.departmentName}
                            </div>
                          )}
                        </td>
                        <td style={{ verticalAlign: "middle" }}>
                          {userGrantedApps.length === 0 ? (
                            <span className="iipe-muted" style={{ fontSize: "0.8rem", fontStyle: "italic" }}>
                              No applications granted
                            </span>
                          ) : (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {userGrantedApps.map((app) => (
                                <span
                                  key={app.clientId}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    background: "color-mix(in srgb, var(--iipe-primary) 12%, transparent)",
                                    border: "1px solid color-mix(in srgb, var(--iipe-primary) 30%, transparent)",
                                    borderRadius: 4,
                                    padding: "2px 8px",
                                    fontSize: "0.75rem",
                                    fontWeight: 500,
                                  }}
                                >
                                  <span>{app.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => toggleSingle(user, app, false)}
                                    title={`Revoke ${app.name}`}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      color: "var(--iipe-danger)",
                                      fontWeight: "bold",
                                      fontSize: "0.8rem",
                                      padding: "0 2px",
                                    }}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ verticalAlign: "middle", textAlign: "right" }}>
                          <button
                            type="button"
                            className="iipe-btn secondary"
                            style={{ padding: "3px 8px", fontSize: "0.75rem" }}
                            onClick={() => toggleUserSelection(user.username)}
                          >
                            {isSelected ? "Deselect" : "Select"}
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
      )}

      {/* ========================================================================= */}
      {/* TAB 3: APP ACCESS INSPECTOR                                               */}
      {/* ========================================================================= */}
      {activeTab === "inspector" && inspectedApp && (
        <div>
          {/* Application Selector Pills */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", color: "var(--iipe-muted)", marginBottom: 8 }}>
              Select Application to Inspect:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {applications.map((app) => {
                const isCurrent = app.clientId === inspectedApp.clientId;
                const count = stats.appStats[app.clientId] || 0;
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

          {/* Inspected App Summary Card */}
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
                  <span className="iipe-badge" style={{ fontSize: "0.8rem" }}>
                    Category: {inspectedApp.category}
                  </span>
                  {inspectedApp.enabled ? (
                    <span className="iipe-badge accent" style={{ fontSize: "0.8rem" }}>
                      Active
                    </span>
                  ) : (
                    <span className="iipe-badge danger" style={{ fontSize: "0.8rem" }}>
                      Disabled
                    </span>
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

              {/* Progress Circle / Stat */}
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

            {/* Role-Wise Access Breakdown for this app */}
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

                      {/* Progress Bar */}
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

                      {/* Bulk Grant / Revoke Buttons for this role */}
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

          {/* User-Level Access List for this App */}
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
                User Access List for {inspectedApp.name} ({inspectedAppGrantedUsers.length} Authorized)
              </h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  className="iipe-input"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ height: 32, fontSize: "0.82rem", width: 220 }}
                />
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
                  {users
                    .filter((u) => {
                      if (!searchQuery.trim()) return true;
                      const q = searchQuery.toLowerCase();
                      return (
                        u.name.toLowerCase().includes(q) ||
                        u.username.toLowerCase().includes(q) ||
                        (u.email && u.email.toLowerCase().includes(q))
                      );
                    })
                    .map((user) => {
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
                            <div className="iipe-muted" style={{ fontSize: "0.8rem" }}>
                              @{user.username}
                            </div>
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
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
