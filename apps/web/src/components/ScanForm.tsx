"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

export function ScanForm() {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
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
    <form onSubmit={submit} className="field">
      <div className={error ? "scan error" : "scan"}>
        <label htmlFor={inputId} className="sr-only">App URL</label>
        <input
          id={inputId}
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:4000"
          aria-describedby={error ? errorId : undefined}
        />
        <button className="btn btn-light btn-sm" type="submit" disabled={busy}>
          {busy ? "Scanning…" : "Scan"}
        </button>
      </div>
      <p className="field-error" id={errorId} role="alert">{error}</p>
    </form>
  );
}
