"use client";

import { useState } from "react";
import type { Note } from "@/lib/seed.ts";

// VULN (secret in bundle): a real OpenAI key hard-coded in CLIENT code. Anything in a "use client"
// module is shipped to the browser in the JS bundle, so this key is readable by anyone via View
// Source / the Network tab. (This value is an OBVIOUSLY FAKE placeholder — never a real key.)
const OPENAI_API_KEY = "sk-proj-DEMOFAKEKEY000000000000000000000000";

// VULN (secret in bundle + RLS off): Supabase URL and anon key hard-coded client-side. The anon
// key is a JWT; with RLS disabled on the backend it can read every table. Also ships in the bundle.
const SUPABASE_URL = "http://localhost:4000/supabase";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzAwMDAwMDAwfQ.DEMO_FAKE_ANON_SIGNATURE_do_not_use";

// Tiny createClient-style wrapper so the keys are genuinely referenced (and bundled).
function createClient(url: string, anonKey: string) {
  return {
    async from(table: string) {
      // Use a relative path at runtime so it works on 4000 and 4001; url constant documents the leak.
      void url;
      const res = await fetch(`/supabase/rest/v1/${table}`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      return res.json();
    },
  };
}
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function callOpenAI(prompt: string): Promise<string> {
  // VULN: a client-side "LLM call" carrying the leaked key in an Authorization header.
  // In this demo it just forwards to our own /api/chat, but the key is real-shaped and exposed.
  void OPENAI_API_KEY;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  return data.reply as string;
}

export default function VibeClient({ notes, initialSpend }: { notes: Note[]; initialSpend: number }) {
  const [spend, setSpend] = useState(initialSpend);
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [dump, setDump] = useState<string>("");

  async function ask() {
    setBusy(true);
    const r = await callOpenAI(prompt || "summarize my notes");
    setReply(r);
    // Reflect the (unthrottled) spend climbing.
    const stats = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "" }),
    }).then((x) => x.json());
    setSpend(stats.aiSpend);
    setBusy(false);
  }

  async function dumpUsers() {
    const rows = await supabase.from("users");
    setDump(`Pulled ${Array.isArray(rows) ? rows.length : 0} rows from users via the anon key`);
  }

  return (
    <div className="grid">
      <section className="card">
        <h2>AI assistant</h2>
        <div className="spend">AI spend: ${spend.toFixed(2)}</div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask the NoteNest assistant about your notes..."
          rows={3}
        />
        <button onClick={ask} disabled={busy}>
          {busy ? "Thinking..." : "Ask AI"}
        </button>
        {reply && <p className="reply">{reply}</p>}
      </section>

      <section className="card">
        <h2>Your notes</h2>
        <ul className="notes">
          {notes.map((n) => (
            <li key={n.id}>
              <strong>{n.title}</strong>
              <span>{n.body}</span>
            </li>
          ))}
        </ul>
        <button className="ghost" onClick={dumpUsers}>
          (debug) load directory from Supabase
        </button>
        {dump && <p className="reply">{dump}</p>}
      </section>
    </div>
  );
}
