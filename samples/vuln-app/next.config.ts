import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { resolve } from "node:path";

// One .env.local at the repo root for every app.
loadEnvConfig(resolve(process.cwd(), "../.."));

const nextConfig: NextConfig = {
  // @antibody/shield is written by another agent; transpile it (and core) as TS workspace deps.
  transpilePackages: ["@antibody/core", "@antibody/shield"],
  // Shielded copy (port 4001, SHIELD=on) gets its own build dir so two dev servers from this one
  // project folder don't collide on .next/dev/lock ("Another next dev server is already running").
  distDir: process.env.SHIELD === "on" ? ".next-shielded" : ".next",
};

export default nextConfig;
