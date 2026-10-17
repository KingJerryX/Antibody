"use client";

import { useState, type FormEvent } from "react";
import type { Guest } from "@/lib/seed.ts";

// VULN (secret in bundle): a Stripe secret hard-coded in CLIENT code. Anything in a "use client"
// module ships in the JS bundle, so this key is readable via View Source. OBVIOUSLY FAKE.
const STRIPE_SECRET_KEY = "sk_test_DEMOFAKEKEY000000000000";

// VULN (RLS off): Supabase URL and anon key hard-coded client-side. The anon key is a JWT; with
// row level security disabled it can read every guests row. Also ships in the bundle.
const SUPABASE_URL = "http://localhost:4020/supabase";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzAwMDAwMDAwfQ.DEMO_FAKE_ANON_SIGNATURE_do_not_use";

function createClient(url: string, anonKey: string) {
  return {
    async from(table: string): Promise<Guest[]> {
      void url;
      const res = await fetch(`/supabase/rest/v1/${table}`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      return res.json();
    },
  };
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

type Shot = { id: number; tone: string; caption: string };

const TONES = ["amber", "rose", "ink", "sage"];

const STARTER: Shot[] = [
  { id: 1, tone: "amber", caption: "doors at 9" },
  { id: 2, tone: "rose", caption: "Maya <em>brought the speaker</em>" },
  { id: 3, tone: "ink", caption: "the good cake" },
  { id: 4, tone: "sage", caption: "rooftop, if it doesn't rain" },
];

const initial = (name: string) => name.trim().charAt(0).toUpperCase();

export default function Party({ initialGuests }: { initialGuests: Guest[] }) {
  const [guests, setGuests] = useState(initialGuests);
  const [shots, setShots] = useState(STARTER);
  const [caption, setCaption] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const unpaid = guests.filter((guest) => !guest.paid).length;

  async function refresh() {
    const rows = await supabase.from("guests");
    if (!Array.isArray(rows)) throw new Error("Couldn't refresh the list.");
    setGuests(rows);
  }

  async function markPaid(id: number) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch("/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        },
        body: JSON.stringify({ type: "checkout.session.completed", guestId: id }),
      });
      if (!res.ok) throw new Error("Couldn't mark that guest paid.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  function addShot(event: FormEvent) {
    event.preventDefault();
    const text = caption.trim().slice(0, 140);
    if (!text) return;
    setShots((prev) => [...prev, { id: Date.now(), tone: TONES[prev.length % TONES.length], caption: text }]);
    setCaption("");
  }

  return (
    <main className="wrap">
      <header className="hero">
        <p className="kicker">Friday · 9pm · Ren&apos;s roof</p>
        <h1>Guestlist</h1>
        <p className="lede">Birthday, six people, bring a layer. Venmo Ren if your name still says unpaid.</p>
      </header>

      <div className="grid">
        <section className="panel" aria-labelledby="list-heading">
          <div className="panel-head">
            <h2 id="list-heading">Who&apos;s coming</h2>
            <p className="count">{unpaid === 0 ? "Everyone's paid." : `${unpaid} still unpaid`}</p>
          </div>
          <ul className="guests">
            {guests.map((guest) => (
              <li key={guest.id}>
                <span className="avatar" aria-hidden="true">{initial(guest.name)}</span>
                <div className="who">
                  <strong>{guest.name}</strong>
                  <span>{guest.phone} · {guest.email}</span>
                  <span className="note">{guest.plusOne}</span>
                </div>
                {guest.paid ? (
                  <span className="pill">Paid</span>
                ) : (
                  <button type="button" onClick={() => markPaid(guest.id)} disabled={busyId === guest.id}>
                    {busyId === guest.id ? "Saving…" : "I've paid"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="panel wall" aria-labelledby="wall-heading">
          <div className="panel-head">
            <h2 id="wall-heading">On the wall</h2>
            <p className="count">Drop a caption</p>
          </div>
          <ul className="shots">
            {shots.map((shot) => (
              <li key={shot.id} className={`shot ${shot.tone}`}>
                {/* VULN (XSS): captions are injected as HTML, including whatever a guest just typed. */}
                <span className="caption" dangerouslySetInnerHTML={{ __html: shot.caption }} />
              </li>
            ))}
          </ul>
          <form className="caption-form" onSubmit={addShot}>
            <label htmlFor="caption">Caption</label>
            <div className="row">
              <input
                id="caption"
                name="caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="the string lights finally worked"
                maxLength={140}
              />
              <button type="submit">Add</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
