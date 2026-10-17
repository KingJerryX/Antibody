"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "./ui";

export function ScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start the scan");
      router.push(`/report/${data.scanId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the scan");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full" aria-describedby="scan-help">
      <label htmlFor="scan-url" className="sr-only">Your app&apos;s URL</label>
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-2 shadow-2xl shadow-mint/5 focus-within:border-mint/60 sm:flex-row">
        <input
          id="scan-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste your app's URL, e.g. http://localhost:4000"
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-lg text-white placeholder:text-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-mint px-6 py-3 text-base font-semibold text-ink transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Starting scan…" : "Scan my app"}
          {!busy && <Icon name="arrow" className="h-4 w-4" />}
        </button>
      </div>
      <p id="scan-help" className="mt-3 text-sm text-slate-400">
        About 30 seconds. Unverified domains get a passive, read-only check.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </form>
  );
}
