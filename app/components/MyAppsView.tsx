"use client";

import { useEffect, useMemo, useState } from "react";
import { appUrl, FAVOURITES_EVENT, readFavourites, toggleFavourite } from "sanapp-common-ui";

export type MyAppEntry = {
  id: string;
  /** OIDC client id — the shared key for favourites (matches the header Apps dropdown). */
  clientId: string;
  name: string;
  description: string | null;
  url: string;
  category: string;
  openInNewTab: boolean;
};

type ViewMode = "cards" | "list";

const VIEW_KEY = "iipe-my-apps-view";

/** Strip the trailing slash so "/logrequest" and "/logrequest/" match. */
function normPath(p: string | null | undefined): string | null {
  if (!p) return null;
  const clean = p.trim().replace(/\/+$/, "") || "/";
  return clean === "/" ? null : clean;
}

/** The path portion of an app URL ("http://intranet.iipe.ac.in/logrequest/" -> "/logrequest"). */
function urlPath(u: string): string | null {
  try {
    return normPath(new URL(u).pathname);
  } catch {
    return normPath(u);
  }
}

function StarIcon({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={on ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45l-5.8 3.05 1.1-6.45-4.7-4.6 6.5-.95L12 2.6z" />
    </svg>
  );
}

function StarButton({ app, on, onToggle }: { app: MyAppEntry; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`iipe-apps-star${on ? " on" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={on}
      aria-label={on ? `Remove ${app.name} from favourites` : `Add ${app.name} to favourites`}
      title={on ? "Remove from favourites" : "Add to favourites"}
    >
      <StarIcon on={on} />
    </button>
  );
}

export function MyAppsView({
  initialApps,
  currentPath,
}: {
  initialApps: MyAppEntry[];
  /** Path of the app the user came from, e.g. "/logrequest" (?from= on the link). */
  currentPath?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("cards");
  const [favs, setFavs] = useState<string[]>([]);

  // Which app the user is currently in. Prefer the ?from= param carried by the
  // shared header's links; fall back to document.referrer for arrivals via the
  // Apps menu / profile dropdown / direct navigation.
  const [herePath, setHerePath] = useState<string | null>(() => normPath(currentPath));
  useEffect(() => {
    setFavs(readFavourites());
    // Live-sync with stars toggled in the header Apps dropdown (and other tabs).
    const refresh = () => setFavs(readFavourites());
    window.addEventListener(FAVOURITES_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(FAVOURITES_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Which app the user is currently in (fallback for arrivals via the Apps
  // menu / profile dropdown / direct navigation).
  useEffect(() => {
    if (herePath) return;
    try {
      setHerePath(urlPath(document.referrer));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the user's card/list preference (per browser, across visits).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "cards" || saved === "list") setView(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function changeView(next: ViewMode) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function toggleFav(app: MyAppEntry) {
    setFavs(toggleFavourite(app.clientId));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialApps;
    return initialApps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [initialApps, query]);

  // Group by category, categories alphabetically, apps alphabetically within.
  const grouped = useMemo(() => {
    const map = new Map<string, MyAppEntry[]>();
    for (const app of filtered) {
      const cat = app.category.trim() || "General";
      const list = map.get(cat) ?? [];
      list.push(app);
      map.set(cat, list);
    }
    return Array.from(map.entries())
      .map(([category, apps]) => ({
        category,
        apps: apps.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [filtered]);

  // Favourited apps are pinned into their own section at the very top.
  const favouriteApps = useMemo(
    () => filtered.filter((a) => favs.includes(a.clientId)),
    [filtered, favs]
  );

  const isHere = (app: MyAppEntry) => {
    const p = urlPath(app.url);
    return !!p && !!herePath && p === herePath;
  };

  const total = initialApps.length;

  const section = (key: string, title: string, apps: MyAppEntry[], accentTitle = false) => (
    <section key={key} style={{ marginBottom: 22 }}>
      <div className="iipe-row" style={{ marginBottom: 10 }}>
        <h2 className="iipe-category-title" style={{ margin: 0 }}>
          {accentTitle ? "★ " : ""}
          {title}
        </h2>
        <span className="iipe-spacer" />
        <span className="iipe-badge">
          {apps.length} app{apps.length === 1 ? "" : "s"}
        </span>
      </div>

      {view === "cards" ? (
        <div className="iipe-grid iipe-grid-2">
          {apps.map((a) => {
            const here = isHere(a);
            const on = favs.includes(a.clientId);
            return (
              <div
                className="iipe-card"
                key={a.id}
                style={{
                  marginBottom: 0,
                  borderColor: here ? "var(--iipe-primary)" : undefined,
                  boxShadow: here ? "0 0 0 1px var(--iipe-primary)" : undefined,
                }}
              >
                <div className="iipe-row" style={{ marginBottom: 6, gap: 8 }}>
                  <h3 style={{ margin: 0 }}>{a.name}</h3>
                  <StarButton app={a} on={on} onToggle={() => toggleFav(a)} />
                  <span className="iipe-spacer" />
                  {here ? (
                    <span className="iipe-badge accent" title="You are currently in this application">
                      ● You are here
                    </span>
                  ) : (
                    <span className="iipe-badge">{a.category}</span>
                  )}
                </div>
                {a.description && (
                  <p className="iipe-muted" style={{ marginTop: 0, marginBottom: 12 }}>
                    {a.description}
                  </p>
                )}
                <a
                  className="iipe-btn"
                  href={appUrl(a.url)}
                  target={a.openInNewTab ? "_blank" : "_self"}
                  rel={a.openInNewTab ? "noreferrer" : undefined}
                >
                  {here ? "Current app" : `Open ${a.name}`}
                  {a.openInNewTab ? " ↗" : ""}
                </a>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="iipe-card" style={{ padding: 6 }}>
          <div className="iipe-table-scroll">
            <table className="iipe-table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Category</th>
                  <th>URL</th>
                  <th style={{ textAlign: "right" }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => {
                  const here = isHere(a);
                  const on = favs.includes(a.clientId);
                  return (
                    <tr key={a.id} style={here ? { background: "var(--iipe-primary-light)" } : undefined}>
                      <td>
                        <span className="iipe-row" style={{ gap: 6 }}>
                          <strong>{a.name}</strong>
                          <StarButton app={a} on={on} onToggle={() => toggleFav(a)} />
                          {here && (
                            <span className="iipe-badge accent" title="You are currently in this application">
                              ● You are here
                            </span>
                          )}
                        </span>
                        {a.description && <div className="iipe-muted">{a.description}</div>}
                      </td>
                      <td>
                        <span className="iipe-badge">{a.category}</span>
                      </td>
                      <td className="iipe-muted">{appUrl(a.url)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <a
                          className="iipe-btn secondary"
                          style={{ padding: "5px 12px" }}
                          href={appUrl(a.url)}
                          target={a.openInNewTab ? "_blank" : "_self"}
                          rel={a.openInNewTab ? "noreferrer" : undefined}
                        >
                          {here ? "Current" : `Open ${a.openInNewTab ? "↗" : "→"}`}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div>
      <div className="iipe-row" style={{ marginBottom: 16 }}>
        <input
          className="iipe-input"
          style={{ maxWidth: 360 }}
          placeholder="Search applications…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search applications"
        />
        <span className="iipe-spacer" />
        <div className="iipe-row" style={{ gap: 6 }} role="group" aria-label="View mode">
          <button
            type="button"
            className={`iipe-btn ${view === "cards" ? "" : "secondary"}`}
            onClick={() => changeView("cards")}
            aria-pressed={view === "cards"}
          >
            ▦ Cards
          </button>
          <button
            type="button"
            className={`iipe-btn ${view === "list" ? "" : "secondary"}`}
            onClick={() => changeView("list")}
            aria-pressed={view === "list"}
          >
            ☰ List
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="iipe-card">
          <div className="iipe-alert">
            {total === 0
              ? "You don't have access to any application yet. Ask an administrator to grant access from the access matrix."
              : `No applications match "${query}".`}
          </div>
        </div>
      ) : (
        <>
          {favouriteApps.length > 0 && section("favourites", "Favourites", favouriteApps, true)}
          {grouped.map(({ category, apps }) => section(category, category, apps))}
        </>
      )}
    </div>
  );
}
