"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export function ScanForm() {
  const router = useRouter();
  const inputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const caretAfterPaste = useRef<number | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // "Scan again" links from the setup page carry the site as ?url=.
  useEffect(() => {
    const preset = new URLSearchParams(window.location.search).get("url");
    if (preset) setUrl(preset.slice(0, 2048));
  }, []);

  useLayoutEffect(() => {
    const el = inputRef.current;
    const caret = caretAfterPaste.current;
    if (!el || caret == null) return;
    el.setSelectionRange(caret, caret);
    caretAfterPaste.current = null;
  }, [url]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      const text = await res.text();
      let data: { error?: string; scanId?: string; report?: unknown } | null = null;
      try {
        data = text ? (JSON.parse(text) as { error?: string; scanId?: string; report?: unknown }) : null;
      } catch {
        throw new Error("Couldn't start the scan");
      }
      if (!res.ok || !data?.scanId) throw new Error(data?.error ?? "Couldn't start the scan");
      // The deployed app can't share the scan file across instances. Keep the report for this tab.
      if (data.report) sessionStorage.setItem(`antibody-scan:${data.scanId}`, JSON.stringify(data.report));
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
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => {
            const el = e.currentTarget;
            const start = el.selectionStart ?? el.value.length;
            caretAfterPaste.current = start + e.clipboardData.getData("text").length;
          }}
          placeholder="http://localhost:4000"
          aria-describedby={error ? errorId : undefined}
        />
        <a className="btn btn-ghost btn-sm" href="/api/github/connect">Connect GitHub</a>
        <button className="btn btn-light btn-sm" type="submit" disabled={busy}>
          {busy ? "Scanning…" : "Scan"}
        </button>
      </div>
      <p className="field-error" id={errorId} role="alert">{error}</p>
      <p className="field-note">Free scan: only what any visitor&apos;s browser can see. Connect GitHub for the full check.</p>
    </form>
  );
}
