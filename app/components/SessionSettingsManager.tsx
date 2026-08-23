"use client";
import { apiPath } from "sanapp-common-ui";
import { useEffect, useState } from "react";

const IDLE_PRESETS = [
  { label: "15 minutes", value: 15 },
  { label: "30 minutes (Default)", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "4 hours", value: 240 },
  { label: "8 hours", value: 480 },
];

const MAX_HOURS_PRESETS = [
  { label: "4 hours", value: 4 },
  { label: "8 hours (Default)", value: 8 },
  { label: "12 hours", value: 12 },
  { label: "24 hours", value: 24 },
  { label: "48 hours", value: 48 },
];

export function SessionSettingsManager() {
  const [idleMinutes, setIdleMinutes] = useState("30");
  const [maxHours, setMaxHours] = useState("8");
  const [initialIdle, setInitialIdle] = useState<number | null>(null);
  const [initialMax, setInitialMax] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiPath("/api/session-settings"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { idleTimeoutMinutes?: number; maxSessionHours?: number } | null) => {
        if (!d) return;
        const im = d.idleTimeoutMinutes ?? 30;
        const mh = d.maxSessionHours ?? 8;
        setIdleMinutes(String(im));
        setMaxHours(String(mh));
        setInitialIdle(im);
        setInitialMax(mh);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const im = parseInt(idleMinutes, 10);
    if (isNaN(im) || im < 1 || im > 1440) {
      setError("Idle timeout must be an integer between 1 and 1440 minutes (24 hours).");
      return;
    }

    const mh = parseInt(maxHours, 10);
    if (isNaN(mh) || mh < 1 || mh > 72) {
      setError("Maximum session duration must be an integer between 1 and 72 hours (3 days).");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(apiPath("/api/session-settings"), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idleTimeoutMinutes: im,
          maxSessionHours: mh,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save session settings.");

      setInitialIdle(im);
      setInitialMax(mh);
      setNotice(data.message ?? "Session timeout settings saved. Applied across all intranet apps.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save session settings.");
    } finally {
      setBusy(false);
    }
  }

  const parsedIdle = parseInt(idleMinutes, 10) || 0;
  const parsedMax = parseInt(maxHours, 10) || 0;

  return (
    <div className="iipe-card">
      <div className="iipe-row" style={{ alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: "0 0 6px" }}>Session Timeout Configuration</h2>
          <p className="iipe-muted" style={{ margin: 0 }}>
            Configure inactivity timeouts and maximum session duration across all intranet
            applications. Settings take effect centrally across SSO, Main, and child apps.
          </p>
        </div>
        <span className="iipe-spacer" />
        {initialIdle !== null && (
          <span className="iipe-badge accent" style={{ whiteSpace: "nowrap" }}>
            Active: {initialIdle} min idle / {initialMax}h max
          </span>
        )}
      </div>

      <form onSubmit={save} className="iipe-form" style={{ marginTop: 20 }}>
        <div style={{ background: "var(--iipe-card-bg-subtle, rgba(0,0,0,0.02))", border: "1px solid var(--iipe-border)", borderRadius: 8, padding: 16 }}>
          <label className="iipe-field" style={{ marginBottom: 10 }}>
            <span className="iipe-label" style={{ fontSize: "1rem", fontWeight: 600 }}>
              ⏱️ Inactivity / Idle Timeout (minutes)
            </span>
            <input
              className="iipe-input"
              type="number"
              min={1}
              max={1440}
              value={idleMinutes}
              onChange={(e) => setIdleMinutes(e.target.value)}
              placeholder="30"
              disabled={loading || busy}
              style={{ maxWidth: 220, fontSize: "1.05rem" }}
            />
            <span className="iipe-muted" style={{ fontSize: "0.82rem", marginTop: 4, display: "block" }}>
              How many minutes of inactivity (no mouse, touch, scroll, or keyboard activity) before a user is automatically signed out across all tabs and apps. Default is 30 minutes.
            </span>
          </label>

          <div style={{ marginTop: 10 }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--iipe-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Quick Presets
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {IDLE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setIdleMinutes(String(p.value))}
                  disabled={loading || busy}
                  className={`iipe-btn secondary ${parsedIdle === p.value ? "accent" : ""}`}
                  style={{
                    padding: "4px 10px",
                    fontSize: "0.82rem",
                    borderRadius: 6,
                    border: parsedIdle === p.value ? "1px solid var(--iipe-primary, #0b5d4f)" : undefined,
                    fontWeight: parsedIdle === p.value ? 600 : 400,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ background: "var(--iipe-card-bg-subtle, rgba(0,0,0,0.02))", border: "1px solid var(--iipe-border)", borderRadius: 8, padding: 16, marginTop: 16 }}>
          <label className="iipe-field" style={{ marginBottom: 10 }}>
            <span className="iipe-label" style={{ fontSize: "1rem", fontWeight: 600 }}>
              ⏳ Absolute Maximum Session Duration (hours)
            </span>
            <input
              className="iipe-input"
              type="number"
              min={1}
              max={72}
              value={maxHours}
              onChange={(e) => setMaxHours(e.target.value)}
              placeholder="8"
              disabled={loading || busy}
              style={{ maxWidth: 220, fontSize: "1.05rem" }}
            />
            <span className="iipe-muted" style={{ fontSize: "0.82rem", marginTop: 4, display: "block" }}>
              The absolute maximum duration a login session remains valid, even if the user stays active (forces re-authentication after this period). Default is 8 hours.
            </span>
          </label>

          <div style={{ marginTop: 10 }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--iipe-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Quick Presets
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {MAX_HOURS_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setMaxHours(String(p.value))}
                  disabled={loading || busy}
                  className={`iipe-btn secondary ${parsedMax === p.value ? "accent" : ""}`}
                  style={{
                    padding: "4px 10px",
                    fontSize: "0.82rem",
                    borderRadius: 6,
                    border: parsedMax === p.value ? "1px solid var(--iipe-primary, #0b5d4f)" : undefined,
                    fontWeight: parsedMax === p.value ? 600 : 400,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live summary preview card */}
        <div
          style={{
            background: "rgba(11, 93, 79, 0.05)",
            border: "1px solid rgba(11, 93, 79, 0.2)",
            borderRadius: 8,
            padding: "12px 16px",
            marginTop: 16,
            fontSize: "0.88rem",
            color: "var(--iipe-text)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>💡 Behavior Summary:</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              Users inactive for <strong>{parsedIdle > 0 ? `${parsedIdle} minute${parsedIdle === 1 ? "" : "s"}` : "..."}</strong> will be automatically signed out across all tabs and open applications.
            </li>
            <li>
              Active user sessions will slide forward and auto-renew up to a maximum of{" "}
              <strong>{parsedMax > 0 ? `${parsedMax} hour${parsedMax === 1 ? "" : "s"}` : "..."}</strong>.
            </li>
            <li>
              Signing out in any application immediately terminates the session everywhere.
            </li>
          </ul>
        </div>

        {error && <div className="iipe-alert danger" style={{ marginTop: 16 }}>{error}</div>}
        {notice && <div className="iipe-alert success" style={{ marginTop: 16 }}>{notice}</div>}

        <div style={{ marginTop: 20 }}>
          <button className="iipe-btn primary" type="submit" disabled={busy || loading}>
            {busy ? "Saving…" : "Save Session Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
