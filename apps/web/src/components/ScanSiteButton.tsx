"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { playScanTransition } from "@/components/home/scanTransition";

/** "Scan" on Your sites: same request as the home page form, for a site that's already set up. */
export function ScanSiteButton({ url }: { url: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Same as the home form: back navigation restores this button still marked busy.
  useLayoutEffect(() => {
    setBusy(false);
  }, []);
  async function scan() {
    setBusy(true);
    setError("");
    try {
      const href = await playScanTransition(async () => {
        const res = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
        const data = (await res.json().catch(() => ({}))) as { error?: string; scanId?: string; report?: unknown };
        if (!res.ok || !data.scanId) throw new Error(data.error ?? "Couldn't start the scan");
        if (data.report) sessionStorage.setItem(`antibody-scan:${data.scanId}`, JSON.stringify(data.report));
        return `/report/${data.scanId}`;
      });
      router.push(href);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the scan");
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" onClick={scan} disabled={busy} className="text-mint hover:underline disabled:opacity-60">
        {busy ? "Scanning…" : "Scan"}
      </button>
      {error && <span role="alert" className="text-red-300">{error}</span>}
    </>
  );
}
