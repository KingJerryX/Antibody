"use client";

import { useEffect, useEffectEvent, useState } from "react";

/** GET `url` every `ms` until `keepGoing(data)` returns false. Errors keep polling (server may be mid-write). */
export function usePoll<T>(url: string, ms: number, keepGoing: (data: T) => boolean = () => true) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  const keep = useEffectEvent(keepGoing);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const text = await res.text();
        if (!text) throw new Error(res.ok ? "Empty response" : res.statusText);
        const body = JSON.parse(text) as T & { error?: string };
        if (!res.ok) throw new Error(body?.error ?? res.statusText);
        if (stopped) return;
        setData(body);
        setError(undefined);
        if (!keep(body)) return;
      } catch (err) {
        if (stopped) return;
        setError(err instanceof Error ? err.message : "Request failed");
      }
      timer = setTimeout(run, ms);
    };
    run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [url, ms, tick]);

  return { data, error, setData, refresh: () => setTick((t) => t + 1) };
}
