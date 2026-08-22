"use client";

import Link from "next/link";
import { apiPath } from "sanapp-common-ui";

export function MatrixNavTabs({
  active,
}: {
  active: "grid" | "allocator" | "inspector";
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        borderBottom: "2px solid var(--iipe-border)",
        marginBottom: 20,
      }}
    >
      <Link
        href={apiPath("/admin-console/app-matrix")}
        style={{
          padding: "10px 18px",
          fontSize: "0.95rem",
          fontWeight: 600,
          cursor: "pointer",
          background: "none",
          border: "none",
          borderBottom: active === "grid" ? "3px solid var(--iipe-primary)" : "3px solid transparent",
          color: active === "grid" ? "var(--iipe-primary)" : "var(--iipe-muted)",
          marginBottom: -2,
          display: "flex",
          alignItems: "center",
          gap: 6,
          textDecoration: "none",
        }}
      >
        <span>⊞</span> Access Matrix (Grid View)
      </Link>

      <Link
        href={apiPath("/admin-console/app-matrix/allocator")}
        style={{
          padding: "10px 18px",
          fontSize: "0.95rem",
          fontWeight: 600,
          cursor: "pointer",
          background: "none",
          border: "none",
          borderBottom: active === "allocator" ? "3px solid var(--iipe-primary)" : "3px solid transparent",
          color: active === "allocator" ? "var(--iipe-primary)" : "var(--iipe-muted)",
          marginBottom: -2,
          display: "flex",
          alignItems: "center",
          gap: 6,
          textDecoration: "none",
        }}
      >
        <span>⚡</span> User &amp; Role Allocator (Batch)
      </Link>

      <Link
        href={apiPath("/admin-console/app-matrix/inspector")}
        style={{
          padding: "10px 18px",
          fontSize: "0.95rem",
          fontWeight: 600,
          cursor: "pointer",
          background: "none",
          border: "none",
          borderBottom: active === "inspector" ? "3px solid var(--iipe-primary)" : "3px solid transparent",
          color: active === "inspector" ? "var(--iipe-primary)" : "var(--iipe-muted)",
          marginBottom: -2,
          display: "flex",
          alignItems: "center",
          gap: 6,
          textDecoration: "none",
        }}
      >
        <span>🔍</span> App Access Inspector
      </Link>
    </div>
  );
}
