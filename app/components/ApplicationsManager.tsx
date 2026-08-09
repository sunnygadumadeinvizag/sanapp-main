"use client";

import { useState } from "react";

export type ManagedApp = {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  url: string;
  enabled: boolean;
  openInNewTab: boolean;
  _count: { grants: number };
};

export type SsoClient = {
  clientId: string;
  name: string;
  description: string | null;
  enabled: boolean;
};

type Draft = {
  name: string;
  description: string;
  clientId: string;
  url: string;
  enabled: boolean;
  openInNewTab: boolean;
};

type ModalState = { mode: "add" } | { mode: "edit"; app: ManagedApp } | null;

const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  clientId: "",
  url: "",
  enabled: true,
  openInNewTab: true,
};

export function ApplicationsManager({
  initialApps,
  ssoClients,
}: {
  initialApps: ManagedApp[];
  ssoClients: SsoClient[];
}) {
  const [apps, setApps] = useState<ManagedApp[]>(initialApps);
  const [modal, setModal] = useState<ModalState>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function api(path: string, method: string, body: unknown) {
    const res = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  function openAdd() {
    setDraft({ ...EMPTY_DRAFT, clientId: ssoClients[0]?.clientId ?? "" });
    setModal({ mode: "add" });
  }

  function openEdit(app: ManagedApp) {
    setDraft({
      name: app.name,
      description: app.description ?? "",
      clientId: app.clientId,
      url: app.url,
      enabled: app.enabled,
      openInNewTab: app.openInNewTab,
    });
    setModal({ mode: "edit", app });
  }

  /** Client ids that may be selected (registered clients + the current value). */
  const selectableClientIds = Array.from(
    new Set([
      ...ssoClients.map((c) => c.clientId),
      ...(modal?.mode === "edit" ? [modal.app.clientId] : []),
      ...(draft.clientId ? [draft.clientId] : []),
    ])
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: draft.name,
        description: draft.description,
        clientId: draft.clientId,
        url: draft.url,
        enabled: draft.enabled,
        openInNewTab: draft.openInNewTab,
      };
      if (modal?.mode === "add") {
        const data = await api("/api/applications", "POST", body);
        const created: ManagedApp = { ...data.application, _count: { grants: 0 } };
        setApps((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setNotice(`Application "${created.name}" registered.`);
      } else if (modal?.mode === "edit") {
        const data = await api("/api/applications", "PATCH", {
          id: modal.app.id,
          ...body,
        });
        const updated: ManagedApp = data.application;
        setApps((prev) =>
          prev
            .map((a) => (a.id === updated.id ? { ...updated, _count: a._count } : a))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setNotice(`Application "${updated.name}" updated.`);
      }
      setModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(app: ManagedApp) {
    setBusy(true);
    setError(null);
    try {
      const data = await api("/api/applications", "PATCH", {
        id: app.id,
        enabled: !app.enabled,
      });
      const updated: ManagedApp = data.application;
      setApps((prev) => prev.map((a) => (a.id === updated.id ? { ...updated, _count: a._count } : a)));
      setNotice(`Application "${updated.name}" ${updated.enabled ? "enabled" : "disabled"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(app: ManagedApp) {
    if (
      !confirm(
        `Delete application "${app.name}"?\nThis also revokes access for all ${app._count.grants} user(s) granted to it.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/applications", "DELETE", { id: app.id });
      setApps((prev) => prev.filter((a) => a.id !== app.id));
      setNotice(`Application "${app.name}" deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const unregisteredClients = ssoClients.length === 0;

  return (
    <div>
      {error && <div className="iipe-alert danger">{error}</div>}
      {notice && (
        <div className="iipe-alert success">
          {notice}
          <button
            type="button"
            onClick={() => setNotice(null)}
            style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {unregisteredClients && (
        <div className="iipe-alert">
          Could not load the OIDC client list from the SSO. You can still register an
          application, but its client id must already exist in the SSO.
        </div>
      )}

      <div className="iipe-row" style={{ marginBottom: 14 }}>
        <span className="iipe-muted">
          {apps.length} application{apps.length === 1 ? "" : "s"} registered
        </span>
        <span className="iipe-spacer" />
        <button className="iipe-btn" type="button" onClick={openAdd} disabled={busy}>
          ＋ Add application
        </button>
      </div>

      <div className="iipe-table-scroll">
        <table className="iipe-table">
          <thead>
            <tr>
              <th>Application</th>
              <th>OIDC client</th>
              <th>Status</th>
              <th>Opens in</th>
              <th style={{ textAlign: "center" }}>Users</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id}>
                <td>
                  <strong>{a.name}</strong>
                  {a.description && <div className="iipe-muted">{a.description}</div>}
                </td>
                <td>
                  <code>{a.clientId}</code>
                </td>
                <td>
                  {a.enabled ? (
                    <span className="iipe-badge">Enabled</span>
                  ) : (
                    <span className="iipe-badge danger">Disabled</span>
                  )}
                </td>
                <td>
                  {a.openInNewTab ? (
                    <span className="iipe-badge accent">New tab</span>
                  ) : (
                    <span className="iipe-badge">Same tab</span>
                  )}
                </td>
                <td style={{ textAlign: "center" }}>{a._count.grants}</td>
                <td>
                  <div className="iipe-row" style={{ gap: 6 }}>
                    <button className="iipe-btn secondary" type="button" onClick={() => openEdit(a)} disabled={busy}>
                      Edit
                    </button>
                    <button className="iipe-btn secondary" type="button" onClick={() => toggleEnabled(a)} disabled={busy}>
                      {a.enabled ? "Disable" : "Enable"}
                    </button>
                    <button className="iipe-btn danger" type="button" onClick={() => remove(a)} disabled={busy}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td colSpan={6} className="iipe-muted">
                  No applications registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="iipe-modal-overlay" onClick={() => !busy && setModal(null)}>
          <form className="iipe-modal" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
            <div className="iipe-row" style={{ marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>
                {modal.mode === "add" ? "Add application" : `Edit ${modal.app.name}`}
              </h2>
              <span className="iipe-spacer" />
              <button type="button" className="iipe-btn ghost" onClick={() => setModal(null)} disabled={busy} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="iipe-field">
              <label className="iipe-label" htmlFor="am-name">Application name</label>
              <input
                id="am-name"
                className="iipe-input"
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="iipe-field">
              <label className="iipe-label" htmlFor="am-desc">Description</label>
              <input
                id="am-desc"
                className="iipe-input"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className="iipe-field">
              <label className="iipe-label" htmlFor="am-url">URL (launch address)</label>
              <input
                id="am-url"
                className="iipe-input"
                type="url"
                required
                placeholder="https://intranet.iipe.ac.in/app4"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              />
            </div>
            <div className="iipe-field">
              <label className="iipe-label" htmlFor="am-client">OIDC client (registered in the SSO)</label>
              <select
                id="am-client"
                className="iipe-select"
                required
                value={draft.clientId}
                onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}
              >
                {selectableClientIds.length === 0 && <option value="">— no SSO clients loaded —</option>}
                {selectableClientIds.map((cid) => (
                  <option key={cid} value={cid}>
                    {cid}
                  </option>
                ))}
              </select>
            </div>
            <div className="iipe-row" style={{ alignItems: "flex-end" }}>
              <label className="iipe-label" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", paddingBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                  style={{ width: 17, height: 17 }}
                />
                Enabled
              </label>
              <label className="iipe-label" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", paddingBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={draft.openInNewTab}
                  onChange={(e) => setDraft({ ...draft, openInNewTab: e.target.checked })}
                  style={{ width: 17, height: 17 }}
                />
                Open in a new tab when launched
              </label>
            </div>
            <p className="iipe-muted" style={{ marginBottom: 0 }}>
              Unchecking &ldquo;Open in a new tab&rdquo; makes the My Apps launcher and the Apps
              menu navigate in the current tab instead.
            </p>

            <div className="iipe-form-actions">
              <button className="iipe-btn" type="submit" disabled={busy}>
                {busy ? "Saving…" : modal.mode === "add" ? "Register application" : "Save changes"}
              </button>
              <button className="iipe-btn secondary" type="button" onClick={() => setModal(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
