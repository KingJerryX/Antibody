"use client";

import { useMemo, useState } from "react";
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

async function callOpenAI(prompt: string): Promise<{ reply: string; aiSpend: number }> {
  // VULN: a client-side "LLM call" carrying the leaked key. In this demo it forwards to our own
  // /api/chat, which has no rate limit, so every click (or bot) runs the AI bill up.
  void OPENAI_API_KEY;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  return res.json();
}

const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "Just now";

const firstLine = (body: string) => body.split("\n").find((l) => l.trim()) ?? "No additional text";

type Filter = { kind: "all" } | { kind: "pinned" } | { kind: "tag"; tag: string };
type Chat = { from: "you" | "ai"; text: string };

export default function NotesApp({ name, notes: initial, initialSpend }: { name: string; notes: Note[]; initialSpend: number }) {
  const [notes, setNotes] = useState(initial);
  const [activeId, setActiveId] = useState(initial[0]?.id);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [chat, setChat] = useState<Chat[]>([]);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [spend, setSpend] = useState(initialSpend);

  const tags = useMemo(() => [...new Set(notes.map((n) => n.tag).filter((t): t is string => Boolean(t)))].sort(), [notes]);
  const visible = notes.filter((n) => {
    if (filter.kind === "pinned" && !n.pinned) return false;
    if (filter.kind === "tag" && n.tag !== filter.tag) return false;
    const q = query.trim().toLowerCase();
    return !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
  });
  const active = notes.find((n) => n.id === activeId);

  const update = (patch: Partial<Note>) =>
    setNotes((all) => all.map((n) => (n.id === activeId ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)));

  function newNote() {
    const id = Math.max(0, ...notes.map((n) => n.id)) + 1;
    setNotes((all) => [{ id, title: "Untitled", body: "", tag: filter.kind === "tag" ? filter.tag : undefined }, ...all]);
    setActiveId(id);
    setQuery("");
  }

  async function sendAsk(prompt: string) {
    if (!prompt.trim() || busy) return;
    setAiOpen(true);
    setChat((c) => [...c, { from: "you", text: prompt }]);
    setAsk("");
    setBusy(true);
    try {
      const { reply, aiSpend } = await callOpenAI(`${prompt}\n\n${active?.title ?? ""}: ${active?.body ?? ""}`);
      setChat((c) => [...c, { from: "ai", text: reply }]);
      setSpend(aiSpend);
    } catch {
      setChat((c) => [...c, { from: "ai", text: "Sorry, I couldn't reach the assistant. Try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  }

  const folder = (label: string, f: Filter, count: number, icon: string) => {
    const on = JSON.stringify(f) === JSON.stringify(filter);
    return (
      <button key={label} className={`folder${on ? " on" : ""}`} onClick={() => setFilter(f)}>
        <span className="folder-icon" aria-hidden="true">{icon}</span>
        {label}
        <span className="count">{count}</span>
      </button>
    );
  };

  return (
    <div className={`app${aiOpen ? " with-ai" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <Logo /> NoteNest
        </div>
        <button className="new" onClick={newNote}>+ New note</button>
        <nav className="folders" aria-label="Folders">
          {folder("All notes", { kind: "all" }, notes.length, "▤")}
          {folder("Pinned", { kind: "pinned" }, notes.filter((n) => n.pinned).length, "★")}
        </nav>
        <p className="section-label">Tags</p>
        <nav className="folders" aria-label="Tags">
          {tags.map((t) => folder(t, { kind: "tag", tag: t }, notes.filter((n) => n.tag === t).length, "#"))}
        </nav>
        <div className="sidebar-foot">
          <div className="usage">
            <span>AI usage this month</span>
            <strong>${spend.toFixed(2)}</strong>
          </div>
          <a className="me" href="/profile">
            <span className="avatar">{name[0]}</span>
            <span>{name}</span>
          </a>
        </div>
      </aside>

      <section className="list" aria-label="Notes">
        <div className="search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes" aria-label="Search notes" />
        </div>
        <ul>
          {visible.map((n) => (
            <li key={n.id}>
              <button className={`note-row${n.id === activeId ? " on" : ""}`} onClick={() => setActiveId(n.id)}>
                <span className="row-top">
                  <strong>{n.title || "Untitled"}</strong>
                  {n.pinned && <span className="pin" aria-label="Pinned">★</span>}
                </span>
                <span className="row-sub">
                  <span className="date">{formatDate(n.updatedAt)}</span> {firstLine(n.body)}
                </span>
              </button>
            </li>
          ))}
          {!visible.length && <li className="empty">No notes match.</li>}
        </ul>
      </section>

      <main className="editor">
        {active ? (
          <>
            <div className="toolbar">
              <span className="meta">
                {active.tag && <span className="tag">#{active.tag}</span>} Edited {formatDate(active.updatedAt)}
              </span>
              <span className="actions">
                <button className="ghost" onClick={() => update({ pinned: !active.pinned })}>
                  {active.pinned ? "Unpin" : "Pin"}
                </button>
                <button className="ai-btn" onClick={() => setAiOpen((o) => !o)}>✦ Ask AI</button>
              </span>
            </div>
            <input className="title" value={active.title} onChange={(e) => update({ title: e.target.value })} aria-label="Title" />
            <textarea className="body" value={active.body} onChange={(e) => update({ body: e.target.value })} placeholder="Start writing…" aria-label="Note" />
          </>
        ) : (
          <div className="empty-editor">Select a note or create a new one.</div>
        )}
      </main>

      {aiOpen && (
        <aside className="ai" aria-label="AI assistant">
          <div className="ai-head">
            <strong>✦ NoteNest AI</strong>
            <button className="ghost" onClick={() => setAiOpen(false)} aria-label="Close assistant">✕</button>
          </div>
          <div className="chips">
            <button onClick={() => sendAsk("Summarize this note")}>Summarize</button>
            <button onClick={() => sendAsk("Turn this into a to-do list")}>Make a to-do list</button>
          </div>
          <div className="chat">
            {!chat.length && <p className="hint">Ask anything about “{active?.title}”.</p>}
            {chat.map((m, i) => (
              <p key={i} className={`bubble ${m.from}`}>{m.text}</p>
            ))}
            {busy && <p className="bubble ai typing">Thinking…</p>}
          </div>
          <form className="ask" onSubmit={(e) => { e.preventDefault(); sendAsk(ask); }}>
            <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Ask NoteNest AI" aria-label="Ask NoteNest AI" />
            <button type="submit" disabled={busy || !ask.trim()}>Send</button>
          </form>
        </aside>
      )}
    </div>
  );
}

/** Settings page directory. It reads the users table straight from Supabase with the public anon key. */
export function WorkspaceMembers() {
  const [members, setMembers] = useState<{ id: number; name: string; email: string; plan: string }[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const rows = await supabase.from("users");
      setMembers(Array.isArray(rows) ? rows : []);
    } catch {
      setError("Couldn't load members.");
    }
  }

  if (!members) {
    return (
      <div className="members-empty">
        <p>See everyone in your NoteNest workspace.</p>
        <button onClick={load}>Load members</button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }
  return (
    <>
      <ul className="members">
        {members.slice(0, 8).map((m) => (
          <li key={m.id}>
            <span className="avatar">{m.name[0]}</span>
            <span className="who">
              <strong>{m.name}</strong>
              <span>{m.email}</span>
            </span>
            <span className={`plan ${m.plan}`}>{m.plan}</span>
          </li>
        ))}
      </ul>
      {members.length > 8 && <p className="more">and {members.length - 8} more members</p>}
    </>
  );
}

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M4 14c0 3.3 3.6 6 8 6s8-2.7 8-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 13.5c2-1.2 4.4-1.8 7-1.8s5 .6 7 1.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9.5" cy="8.5" r="2.2" fill="currentColor" />
      <circle cx="14.5" cy="8.5" r="2.2" fill="currentColor" opacity=".65" />
    </svg>
  );
}
