"use client";
import { apiPath } from "sanapp-common-ui";
import { useEffect, useState } from "react";

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  fromEmail: string;
  fromName?: string;
  hasPassword: boolean;
};

const HOST_RE = /^[a-z0-9.-]+$/i;

export function EmailSettingsManager() {
  const [config, setConfig] = useState<SmtpConfig | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState("IIPE Intranet");
  const [fromEmail, setFromEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiPath("/api/email-settings"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { configured?: boolean; smtp?: SmtpConfig | null } | null) => {
        if (!d || !d.smtp) return;
        const s = d.smtp;
        setConfig(s);
        setHost(s.host);
        setPort(String(s.port));
        setUser(s.user);
        setFromName(s.fromName || "IIPE Intranet");
        setFromEmail(s.fromEmail);
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!host || !HOST_RE.test(host)) {
      setError("Enter a valid SMTP host, e.g. smtp.gmail.com");
      return;
    }
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) {
      setError("Port must be 1–65535 (587 for TLS, 465 for SSL).");
      return;
    }
    if (!user.trim()) {
      setError("SMTP username is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail.trim())) {
      setError("Enter a valid From email address.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(apiPath("/api/email-settings"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host: host.trim(),
          port: p,
          user: user.trim(),
          fromName: fromName.trim() || "IIPE Intranet",
          fromEmail: fromEmail.trim(),
          password: password.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save SMTP settings");
      setConfig(data.smtp);
      setPassword("");
      setNotice(data.message ?? "SMTP settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save SMTP settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="iipe-card">
      <h2>Email / SMTP configuration</h2>
      <p className="iipe-muted" style={{ marginTop: 0 }}>
        These credentials are used by the central SSO to send transactional
        emails — forgot-password OTPs and any future notifications. They are
        stored in the SSO database (never in source code or environment files).
      </p>

      {config && (
        <p className="iipe-badge accent" style={{ marginBottom: 12, display: "inline-block" }}>
          Currently configured
        </p>
      )}

      <form onSubmit={save} className="iipe-form">
        <label className="iipe-field">
          <span className="iipe-label">SMTP host</span>
          <input
            className="iipe-input"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="smtp.gmail.com"
          />
        </label>
        <label className="iipe-field">
          <span className="iipe-label">SMTP port</span>
          <input
            className="iipe-input"
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="587"
          />
        </label>
        <label className="iipe-field">
          <span className="iipe-label">SMTP username</span>
          <input
            className="iipe-input"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="user@iipe.ac.in"
            autoComplete="off"
          />
        </label>
        <label className="iipe-field">
          <span className="iipe-label">SMTP password</span>
          <input
            className="iipe-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={config?.hasPassword ? "•••••••• (leave blank to keep)" : "Enter the SMTP password"}
            autoComplete="new-password"
          />
        </label>
        <label className="iipe-field">
          <span className="iipe-label">From sender name (display name)</span>
          <input
            className="iipe-input"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="IIPE Intranet"
          />
          <span className="iipe-muted" style={{ fontSize: "0.82rem", marginTop: 4, display: "block" }}>
            The sender name recipients see in their inbox (e.g. &quot;IIPE Intranet&quot;).
          </span>
        </label>
        <label className="iipe-field">
          <span className="iipe-label">From email address</span>
          <input
            className="iipe-input"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder="noreply@iipe.ac.in"
          />
        </label>

        {error && <div className="iipe-alert danger">{error}</div>}
        {notice && <div className="iipe-alert success">{notice}</div>}

        <button className="iipe-btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save SMTP settings"}
        </button>
      </form>
    </div>
  );
}
