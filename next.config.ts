import path from "node:path";
import type { NextConfig } from "next";

// Monorepo root: iipe-common-ui lives outside this project directory.
const MONOREPO_ROOT = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  // iipe-common-ui ships TypeScript source; ask Next to compile it.
  transpilePackages: ["iipe-common-ui"],
  // Resolve linked packages (iipe-common-ui) outside the project root.
  turbopack: {
    root: MONOREPO_ROOT,
  },
  outputFileTracingRoot: MONOREPO_ROOT,
  // In production behind Apache this app is served at https://intranet.iipe.ac.in/main
  basePath: process.env.BASE_PATH || "",
};

export default nextConfig;
