"use client";

import { useMemo, useState } from "react";
import { apiPath } from "sanapp-common-ui";
import {
  MatrixUser,
  MatrixApp,
  MatrixGrant,
  RoleRule,
  EffectiveDecision,
  DepartmentOption,
  PRIMARY_ROLES,
  getRoleLabel,
} from "./matrixTypes";
import "../admin-console/app-matrix/matrix.css";

/**
 * Resolve access exactly like src/lib/access.ts:
 *   1. role rule with overrideUsers -> wins (role over user)
 *   2. direct user row              -> wins (user over role)
 *   3. role rule                    -> default
 */
function decide(
  direct: { role: string; effect: string } | null,
  rule: { role: string; effect: string; overrideUsers: boolean } | null
): EffectiveDecision | null {
  const effectOf = (v: string | undefined) => (String(v ?? "").toUpperCase() === "DENY" ? "DENY" : "ALLOW");
  if (rule?.overrideUsers) {
    const effect = effectOf(rule.effect);
    return { role: rule.role, allowed: effect === "ALLOW", effect, source: "role", overrodeUser: true };
  }
  if (direct) {
    const effect = effectOf(direct.effect);
    return { role: direct.role, allowed: effect === "ALLOW", effect, source: "direct", overrodeUser: false };
  }
  if (rule) {
    const effect = effectOf(rule.effect);
    return { role: rule.role, allowed: effect === "ALLOW", effect, source: "role", overrodeUser: false };
  }
  return null;
}

export function AccessMatrixAllocator({
  users,
  applications,
  initialGrants,
  initialRoleRules = [],
  departments,
  initialRole,
}: {
  users: MatrixUser[];
  applications: MatrixApp[];
  initialGrants: MatrixGrant[];
  initialRoleRules?: RoleRule[];
  departments: DepartmentOption[];
  initialRole?: string;
}) {
  const [grants, setGrants] = useState<MatrixGrant[]>(initialGrants);
  const [roleRules, setRoleRules] = useState<RoleRule[]>(initialRoleRules);
  const [ruleRole, setRuleRole] = useState<string>(PRIMARY_ROLES[0]?.value ?? "GUEST");
  const [ruleApps, setRuleApps] = useState<Set<string>>(new Set());
  const [ruleRoleLevel, setRuleRoleLevel] = useState<"USER" | "APP_ADMIN">("USER");
  const [ruleEffect, setRuleEffect] = useState<"ALLOW" | "DENY">("ALLOW");
  const [ruleOverrideUsers, setRuleOverrideUsers] = useState<boolean>(false);
  const [ruleBusy, setRuleBusy] = useState(false);
  const [ruleFeedback, setRuleFeedback] = useState<string | null>(null);
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
    const map = new Map<string, { role: string; effect: string }>();
    for (const g of grants) {
      map.set(`${g.username}:${g.clientId}`, {
        role: g.role || "USER",
        effect: String(g.effect ?? "ALLOW").toUpperCase(),
      });
    }
    return map;
  }, [grants]);

  function getGrant(username: string, clientId: string) {
    return grantMap.get(`${username}:${clientId}`) ?? null;
  }

  // A role rule is inherited access: shown as such, and never written as a
  // per-user grant, so a new member of the role inherits it automatically.
  const roleRuleMap = useMemo(() => {
    const map = new Map<string, { role: string; effect: string; overrideUsers: boolean }>();
    for (const r of roleRules) {
      map.set(`${r.primaryRole}:${r.clientId}`, {
        role: r.role || "USER",
        effect: String(r.effect ?? "ALLOW").toUpperCase(),
        overrideUsers: r.overrideUsers === true,
      });
    }
    return map;
  }, [roleRules]);

  function roleRuleFor(primaryRole: string, clientId: string) {
    return roleRuleMap.get(`${primaryRole}:${clientId}`) ?? null;
  }

  /** The access a user actually has, applying the full precedence rules. */
  function effectiveRole(user: MatrixUser, clientId: string): EffectiveDecision | null {
    return decide(getGrant(user.username, clientId), roleRuleFor(user.primaryRole, clientId));
  }

  async function saveRoleRules(add: boolean) {
    if (ruleApps.size === 0 && add) {
      setRuleFeedback("Pick at least one application for the role.");
      return;
    }
    setRuleBusy(true);
    setRuleFeedback(null);
    const clientIds = [...ruleApps];
    try {
      const res = await fetch(apiPath("/api/grants/roles"), {
        method: add ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          primaryRole: ruleRole,
          clientIds,
          ...(add ? { role: ruleRoleLevel, effect: ruleEffect, overrideUsers: ruleOverrideUsers } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Request failed");
      }
      setRoleRules((prev) => {
        const rest = prev.filter((r) => !(r.primaryRole === ruleRole && clientIds.includes(r.clientId)));
        return add
          ? [
              ...rest,
              ...clientIds.map((clientId) => ({
                primaryRole: ruleRole,
                clientId,
                role: ruleRoleLevel,
                effect: ruleEffect,
                overrideUsers: ruleOverrideUsers,
              })),
            ]
          : rest;
      });
      const verb = ruleEffect === "DENY" ? "blocked" : "granted";
      setRuleFeedback(
        add
          ? `Saved. Every ${getRoleLabel(ruleRole)} is now ${verb} ${clientIds.length} app(s)${
              ruleOverrideUsers ? " and the role overrides individual users" : ""
            }. New users inherit this automatically.`
          : `Removed ${clientIds.length} app(s) from ${getRoleLabel(ruleRole)}.`
      );
    } catch (e) {
      setRuleFeedback(e instanceof Error ? e.message : "Failed to save role rules.");
    } finally {
      setRuleBusy(false);
    }
  }

  /** Flip only `overrideUsers` for the selected role+apps, keeping the decision. */
  async function setRoleOverride(overrideUsers: boolean) {
    if (ruleApps.size === 0) {
      setRuleFeedback("Pick at least one application first.");
      return;
    }
    setRuleBusy(true);
    setRuleFeedback(null);
    const clientIds = [...ruleApps].filter((cid) => roleRuleFor(ruleRole, cid));
    if (clientIds.length === 0) {
      setRuleBusy(false);
      setRuleFeedback("Those apps have no role rule yet — grant or block them first.");
      return;
    }
    try {
      // Send one request per app so each rule keeps its own decision/level;
      // only the precedence flag changes.
      for (const cid of clientIds) {
        const current = roleRuleFor(ruleRole, cid)!;
        const res = await fetch(apiPath("/api/grants/roles"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            primaryRole: ruleRole,
            clientIds: [cid],
            role: current.role,
            effect: current.effect,
            overrideUsers,
          }),
        });
        if (!res.ok) throw new Error("Request failed");
      }
      setRoleRules((prev) =>
        prev.map((r) =>
          r.primaryRole === ruleRole && clientIds.includes(r.clientId) ? { ...r, overrideUsers } : r
        )
      );
      setRuleFeedback(
        overrideUsers
          ? `Role now overrides individual users on ${clientIds.length} app(s).`
          : `Individual user rows now win over the role on ${clientIds.length} app(s).`
      );
    } catch (e) {
      setRuleFeedback(e instanceof Error ? e.message : "Failed to change precedence.");
    } finally {
      setRuleBusy(false);
    }
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
        const hasAny = applications.some((a) => effectiveRole(u, a.clientId)?.allowed);
        if (!hasAny) return false;
      } else if (filterAppGrant === "NONE") {
        const hasAny = applications.some((a) => effectiveRole(u, a.clientId)?.allowed);
        if (hasAny) return false;
      } else if (filterAppGrant === "DENIED") {
        const hasDenied = applications.some((a) => {
          const d = effectiveRole(u, a.clientId);
          return d !== null && !d.allowed;
        });
        if (!hasDenied) return false;
      } else if (filterAppGrant.startsWith("HAS_ADMIN_")) {
        const cid = filterAppGrant.replace("HAS_ADMIN_", "");
        const d = effectiveRole(u, cid);
        if (!d?.allowed || d.role !== "APP_ADMIN") return false;
      } else if (filterAppGrant.startsWith("HAS_")) {
        const cid = filterAppGrant.replace("HAS_", "");
        if (!effectiveRole(u, cid)?.allowed) return false;
      } else if (filterAppGrant.startsWith("MISSING_")) {
        const cid = filterAppGrant.replace("MISSING_", "");
        if (effectiveRole(u, cid)?.allowed) return false;
      }

      if (filterSelectionOnly && !selectedUsernames.has(u.username)) return false;

      return true;
    });
  }, [users, searchQuery, filterPrimaryRole, filterDepartment, filterAppGrant, filterSelectionOnly, selectedUsernames, grantMap, roleRuleMap, applications]);

  // Single decision: ALLOW, DENY (block), or CLEAR (fall back to role)
  async function toggleSingle(
    user: MatrixUser,
    app: MatrixApp,
    effect: "ALLOW" | "DENY" | "CLEAR",
    role: "USER" | "APP_ADMIN" = "USER"
  ) {
    const key = `${user.username}:${app.clientId}`;
    setBusyKeys((prev) => new Set(prev).add(key));
    setFeedback(null);

    const oldGrants = [...grants];

    setGrants((prev) => {
      const rest = prev.filter((g) => !(g.clientId === app.clientId && g.username === user.username));
      if (effect === "CLEAR") return rest;
      return [...rest, { userId: user.id, username: user.username, clientId: app.clientId, role, effect }];
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
          effect,
          role,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      setFeedback({
        type: "success",
        message:
          effect === "DENY"
            ? `Blocked ${app.name} for ${user.name} (@${user.username}).`
            : effect === "CLEAR"
              ? `Cleared the direct row for ${user.name} on ${app.name}; the role rule applies again.`
              : `Granted ${app.name} to ${user.name} as ${role === "APP_ADMIN" ? "App Admin" : "User"}.`,
      });
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
    action: "grant" | "deny" | "revoke" | "set_exact" | "grant_all" | "revoke_all" | "deny_all" | "set_role",
    targetRole: "USER" | "APP_ADMIN" = "USER"
  ) {
    if (selectedUsernames.size === 0) {
      setFeedback({ type: "info", message: "Please select at least one user first." });
      return;
    }

    const selectedUsersList = users.filter((u) => selectedUsernames.has(u.username));
    let targetClientIds: string[] = [];

    if (action === "grant_all" || action === "revoke_all" || action === "deny_all") {
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
      action === "grant_all"
        ? "grant"
        : action === "revoke_all"
          ? "revoke"
          : action === "deny_all"
            ? "deny"
            : action;

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
              updated.push({ userId: u.id, username: u.username, clientId: cid, role: targetRole, effect: "ALLOW" });
            }
          }
        } else if (apiAction === "grant" || apiAction === "set_role") {
          for (const u of selectedUsersList) {
            for (const cid of targetClientIds) {
              const idx = updated.findIndex((g) => g.username === u.username && g.clientId === cid);
              if (idx >= 0) {
                updated[idx] = { ...updated[idx], role: targetRole, effect: "ALLOW" };
              } else {
                updated.push({ userId: u.id, username: u.username, clientId: cid, role: targetRole, effect: "ALLOW" });
              }
            }
          }
        } else if (apiAction === "deny") {
          for (const u of selectedUsersList) {
            for (const cid of targetClientIds) {
              const idx = updated.findIndex((g) => g.username === u.username && g.clientId === cid);
              if (idx >= 0) {
                updated[idx] = { ...updated[idx], effect: "DENY" };
              } else {
                updated.push({ userId: u.id, username: u.username, clientId: cid, role: targetRole, effect: "DENY" });
              }
            }
          }
        }
        return updated;
      });

      const roleStr = targetRole === "APP_ADMIN" ? " as APP_ADMIN" : "";
      setFeedback({
        type: "success",
        message:
          apiAction === "deny"
            ? `Blocked ${selectedUsersList.length} user(s) on ${targetClientIds.length} app(s).`
            : `Successfully updated ${selectedUsersList.length} user(s) across ${targetClientIds.length} app(s)${roleStr}.`,
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

      {/* Role Rules — allocate an app to a whole primary role once. Users added
          to that role later inherit the apps automatically. */}
      <div className="mx-card" style={{ marginBottom: 16 }}>
        <div className="mx-card-title" style={{ marginBottom: 8 }}>Role rules (automatic access)</div>
        <p className="iipe-muted" style={{ margin: "0 0 10px", fontSize: "0.85rem" }}>
          Grant or block an application for a whole primary role once. Every current and future user
          with that role inherits it — no need to allocate each new user. By default a direct
          per-user row wins over the role rule; tick <strong>Role overrides users</strong> to make the
          role rule authoritative instead. A <strong>blocked</strong> user is denied even when their
          role grants the app.
        </p>
        <div className="mx-filters">
          <select
            className="iipe-select"
            aria-label="Role for the rule"
            value={ruleRole}
            onChange={(e) => setRuleRole(e.target.value)}
          >
            {PRIMARY_ROLES.map((pr) => (
              <option key={pr.value} value={pr.value}>{pr.label}</option>
            ))}
          </select>
          <select
            className="iipe-select"
            aria-label="Decision for the role"
            value={ruleEffect}
            onChange={(e) => setRuleEffect(e.target.value as "ALLOW" | "DENY")}
          >
            <option value="ALLOW">Allow access</option>
            <option value="DENY">Block access</option>
          </select>
          <select
            className="iipe-select"
            aria-label="Access level for the role"
            value={ruleRoleLevel}
            onChange={(e) => setRuleRoleLevel(e.target.value as "USER" | "APP_ADMIN")}
            disabled={ruleEffect === "DENY"}
          >
            <option value="USER">As User</option>
            <option value="APP_ADMIN">As App Admin</option>
          </select>
          <label
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", cursor: "pointer" }}
            title="When ticked, this role rule wins over direct per-user rows (role over user)"
          >
            <input
              type="checkbox"
              checked={ruleOverrideUsers}
              onChange={(e) => setRuleOverrideUsers(e.target.checked)}
            />
            Role overrides users
          </label>
        </div>
        <div className="mx-app-picker" style={{ marginTop: 8 }}>
          {applications.map((app) => {
            const isPicked = ruleApps.has(app.clientId);
            const existing = roleRuleFor(ruleRole, app.clientId);
            const existingLabel = existing
              ? `${existing.effect === "DENY" ? "blocked" : existing.role}${
                  existing.overrideUsers ? " · role overrides users" : ""
                }`
              : null;
            return (
              <button
                key={`rule_${app.clientId}`}
                type="button"
                className={`mx-chip${isPicked ? " picked" : ""}${
                  existing && !isPicked ? (existing.effect === "DENY" ? " denied" : " on") : ""
                }`}
                aria-pressed={isPicked}
                title={existingLabel ? `Currently ${existingLabel} for this role` : undefined}
                onClick={() => {
                  setRuleApps((prev) => {
                    const next = new Set(prev);
                    if (next.has(app.clientId)) next.delete(app.clientId);
                    else next.add(app.clientId);
                    return next;
                  });
                }}
              >
                {isPicked ? "✓" : existing ? (existing.effect === "DENY" ? "⊘" : "•") : "+"} {app.name}
                {existing ? ` (${existing.effect === "DENY" ? "blocked" : "on"}${existing.overrideUsers ? " ⇉" : ""})` : ""}
              </button>
            );
          })}
        </div>
        <div className="mx-batch-actions" style={{ marginTop: 10 }}>
          <button
            type="button"
            className={`iipe-btn ${ruleEffect === "DENY" ? "danger" : "primary"}`}
            disabled={ruleBusy || ruleApps.size === 0}
            onClick={() => saveRoleRules(true)}
          >
            {ruleBusy
              ? "Saving…"
              : `${ruleEffect === "DENY" ? "⊘ Block" : "Grant"} ${getRoleLabel(ruleRole)} (${ruleApps.size})`}
          </button>
          <button
            type="button"
            className="iipe-btn secondary"
            disabled={ruleBusy || ruleApps.size === 0}
            onClick={() => setRoleOverride(!ruleOverrideUsers)}
            title="Apply the role-over-user precedence to the selected apps"
          >
            {ruleBusy ? "Saving…" : ruleOverrideUsers ? "⇉ Role wins" : "User wins"}
          </button>
          <button
            type="button"
            className="iipe-btn danger"
            disabled={ruleBusy || ruleApps.size === 0}
            onClick={() => saveRoleRules(false)}
          >
            Remove from role ({ruleApps.size})
          </button>
          {ruleFeedback && <span className="iipe-muted">{ruleFeedback}</span>}
        </div>
      </div>

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
              title="Remove direct rows so the role rule applies again"
            >
              {batchBusy ? "Processing…" : `− Revoke (${batchSelectedApps.size})`}
            </button>

            <button
              type="button"
              className="iipe-btn secondary mx-btn-deny"
              disabled={batchBusy || batchSelectedApps.size === 0}
              onClick={() => executeBatch("deny")}
              title="Block these users even if their role grants the app (user over role)"
            >
              {batchBusy ? "Processing…" : `⊘ Block (${batchSelectedApps.size})`}
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
            <option value="DENIED">Has a Blocked App</option>
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
                const userDecisions = applications
                  .map((a) => {
                    const eff = effectiveRole(user, a.clientId);
                    return eff ? { app: a, eff } : null;
                  })
                  .filter(Boolean) as { app: MatrixApp; eff: EffectiveDecision }[];

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
                      {userDecisions.length === 0 ? (
                        <span className="iipe-muted">—</span>
                      ) : (
                        <div className="mx-grant-pills">
                          {userDecisions.map(({ app, eff }) => {
                            const isAppAdmin = eff.allowed && eff.role === "APP_ADMIN";
                            const isBusy = busyKeys.has(`${user.username}:${app.clientId}`) || batchBusy;
                            const direct = getGrant(user.username, app.clientId);
                            const fromRole = eff.source === "role";
                            const locked = eff.overrodeUser;
                            const denied = !eff.allowed;
                            const pillClass = denied
                              ? " deny"
                              : fromRole
                                ? " role"
                                : isAppAdmin
                                  ? " admin"
                                  : "";
                            const title = locked
                              ? `The ${getRoleLabel(user.primaryRole)} role rule overrides individual users`
                              : fromRole
                                ? denied
                                  ? `Blocked by the ${getRoleLabel(user.primaryRole)} role rule`
                                  : `Inherited from the ${getRoleLabel(user.primaryRole)} role rule`
                                : denied
                                  ? "Explicitly blocked for this user"
                                  : undefined;

                            return (
                              <span key={app.clientId} className={`mx-grant-pill${pillClass}`} title={title}>
                                <span>
                                  {denied ? "⊘ " : isAppAdmin ? "⭐ " : ""}
                                  {app.name}
                                  {fromRole ? (denied ? " · role block" : " · role") : denied ? " · blocked" : ""}
                                  {eff.overrodeUser ? " ⇉" : ""}
                                </span>
                                {locked ? (
                                  <span className="iipe-muted" style={{ fontSize: "0.7rem" }}>via role</span>
                                ) : denied ? (
                                  <>
                                    <button
                                      type="button"
                                      className="promote"
                                      disabled={isBusy}
                                      onClick={() => toggleSingle(user, app, "ALLOW", "USER")}
                                      title="Give this user direct access (user over role)"
                                    >
                                      Allow
                                    </button>
                                    {direct && (
                                      <button
                                        type="button"
                                        className="revoke"
                                        disabled={isBusy}
                                        onClick={() => toggleSingle(user, app, "CLEAR")}
                                        title="Clear the direct block; the role rule applies again"
                                        aria-label={`Clear block on ${app.name}`}
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </>
                                ) : fromRole ? (
                                  <>
                                    <button
                                      type="button"
                                      className="promote"
                                      disabled={isBusy}
                                      onClick={() =>
                                        toggleSingle(user, app, "ALLOW", isAppAdmin ? "APP_ADMIN" : "USER")
                                      }
                                      title="Make this user's access explicit (overrides the role rule)"
                                    >
                                      Pin
                                    </button>
                                    <button
                                      type="button"
                                      className="revoke"
                                      disabled={isBusy}
                                      onClick={() => toggleSingle(user, app, "DENY")}
                                      title="Block this user even though the role grants the app"
                                      aria-label={`Block ${app.name} for ${user.username}`}
                                    >
                                      ⊘
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="promote"
                                      disabled={isBusy}
                                      onClick={() => toggleSingle(user, app, "ALLOW", isAppAdmin ? "USER" : "APP_ADMIN")}
                                      title={isAppAdmin ? "Demote to regular User" : "Promote to App Admin"}
                                    >
                                      {isAppAdmin ? "User" : "★"}
                                    </button>
                                    <button
                                      type="button"
                                      className="revoke"
                                      disabled={isBusy}
                                      onClick={() => toggleSingle(user, app, "DENY")}
                                      title={`Block ${app.name} even if the role grants it`}
                                      aria-label={`Block ${app.name}`}
                                    >
                                      ⊘
                                    </button>
                                    <button
                                      type="button"
                                      className="revoke"
                                      disabled={isBusy}
                                      onClick={() => toggleSingle(user, app, "CLEAR")}
                                      title={`Clear the direct row for ${app.name}`}
                                      aria-label={`Clear ${app.name}`}
                                    >
                                      ✕
                                    </button>
                                  </>
                                )}
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
