"use client";

import Link from "next/link";
import "../admin-console/app-matrix/matrix.css";

const TABS: { key: "grid" | "allocator" | "inspector"; href: string; icon: string; label: string }[] = [
  { key: "grid", href: "/admin-console/app-matrix", icon: "⊞", label: "Matrix Grid" },
  { key: "allocator", href: "/admin-console/app-matrix/allocator", icon: "⚡", label: "Batch Allocator" },
  { key: "inspector", href: "/admin-console/app-matrix/inspector", icon: "🔍", label: "App Inspector" },
];

export function MatrixNavTabs({
  active,
}: {
  active: "grid" | "allocator" | "inspector";
}) {
  return (
    <nav className="mx-tabs" aria-label="App Matrix views">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`mx-tab${active === t.key ? " active" : ""}`}
          aria-current={active === t.key ? "page" : undefined}
        >
          <span aria-hidden>{t.icon}</span> {t.label}
        </Link>
      ))}
    </nav>
  );
}
