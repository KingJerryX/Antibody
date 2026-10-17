import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { resolve } from "node:path";

// One .env.local at the repo root for every app.
const repoRoot = resolve(process.cwd(), "../..");
// forceReload: Next already loaded (empty) env for apps/web, and @next/env returns that cached result otherwise.
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", undefined, true);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@antibody/core", "@antibody/scanner"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
