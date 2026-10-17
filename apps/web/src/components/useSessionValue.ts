"use client";

import { useMemo, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

function readRaw(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** JSON cached in sessionStorage by an earlier page. Undefined on the server, or when missing or corrupt. */
export function useSessionValue<T>(key: string): T | undefined {
  const raw = useSyncExternalStore(noSubscribe, () => readRaw(key), () => null);
  return useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  }, [raw]);
}
