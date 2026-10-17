import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { resolve } from "node:path";

// One .env.local at the repo root for every app.
loadEnvConfig(resolve(process.cwd(), "../.."));

const nextConfig: NextConfig = {
  devIndicators: false,
};

export default nextConfig;
