"use client";
import { apiPath } from "iipe-common-ui";

import { useEffect, useState } from "react";

type ThemeConfig = {
  mode: "light" | "dark" | "system";
  primary: string;
  accent: string;
};

const MODE_LABELS: Record<ThemeConfig["mode"], string> = {
  light: "Light",
  dark: "Dark",
  system: "System (follow the user's OS)",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function ThemeManager() {
  const [config, setConfig] = useState<ThemeConfig | null>(null);
  const [mode, setMode] = useState<ThemeConfig["mode"]>("system");
  const [primary, setPrimary] = useState("#0b5d4f");
  const [accent, setAccent] = useState("#d9a441");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiPath("/api/theme"))
      .then((r) => (r.ok ? r.json() : null))
      .then((t: ThemeConfig | null) => {
        if (!t) return;
        setConfig(t);
        setMode(t.mode === "light" || t.mode === "dark" || t.mode === "system" ? t.mode : "system");
        setPrimary(HEX.test(t.primary) ? t.primary : "#0b5d4f");
        setAccent(HEX.test(t.accent) ? t.accent : "#d9a441");
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!HEX.test(primary)) {
      setError("Primary color must be a hex color like #0b5d4f.");
      return;
    }
    if (!HEX.test(accent)) {
      setError("Accent color must be a hex color like #d9a441.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(apiPath("/api/theme"), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, primary, accent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setNotice("Theme updated — it applies to the whole platform.");
      setConfig({ mode, primary, accent });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="iipe-alert danger">{error}</div>}
      {notice && <div className="iipe-alert success">{notice}</div>}

      {!config ? (
        <p className="iipe-muted">Loading current theme…</p>
      ) : (
        <form onSubmit={save} className="iipe-card" style={{ maxWidth: 520 }}>
          <h2>Theme</h2>

          <div className="iipe-field">
            <label className="iipe-label" htmlFor="theme-mode">
              Default mode
            </label>
            <select
              id="theme-mode"
              className="iipe-select"
              value={mode}
              onChange={(e) => setMode(e.target.value as ThemeConfig["mode"])}
            >
              <option value="light">{MODE_LABELS.light}</option>
              <option value="dark">{MODE_LABELS.dark}</option>
              <option value="system">{MODE_LABELS.system}</option>
            </select>
            <p className="iipe-muted" style={{ margin: "6px 0 0" }}>
              The mode every visitor sees until they pick their own with the header toggle (☀️ /
              🌙 / 🖥️). Users can always override it for themselves.
            </p>
          </div>

          <div className="iipe-field">
            <label className="iipe-label" htmlFor="theme-primary">
              Primary color (header, buttons, links)
            </label>
            <div className="iipe-row">
              <input
                id="theme-primary"
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                style={{ width: 44, height: 36, padding: 2, cursor: "pointer" }}
              />
              <input
                className="iipe-input"
                style={{ maxWidth: 140, fontFamily: "monospace" }}
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                aria-label="Primary color hex"
              />
            </div>
          </div>

          <div className="iipe-field">
            <label className="iipe-label" htmlFor="theme-accent">
              Accent color (logo badge, highlights)
            </label>
            <div className="iipe-row">
              <input
                id="theme-accent"
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                style={{ width: 44, height: 36, padding: 2, cursor: "pointer" }}
              />
              <input
                className="iipe-input"
                style={{ maxWidth: 140, fontFamily: "monospace" }}
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                aria-label="Accent color hex"
              />
            </div>
          </div>

          <div className="iipe-form-actions">
            <button className="iipe-btn" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save theme"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
