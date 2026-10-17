"use client";

import { usePoll } from "@/components/usePoll";

export type Health = { orchestrator: "up" | "down"; fixes?: "ready" | "offline"; integrations?: Record<string, "live" | "mock" | "disabled"> };

/** Orchestrator reachability and which integrations are live, so the UI never overclaims. */
export const useHealth = () => usePoll<Health>("/api/health", 10_000).data;
