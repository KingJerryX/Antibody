import { Logo, WorkspaceMembers } from "../_components/VibeClient.tsx";
import { USERS } from "../lib/seed.ts";
import { state } from "../lib/state.ts";

export const metadata = { title: "Settings · NoteNest" };

// The signed-in user's settings (demo: always user 1). Any profile also loads at /api/users/<id> (IDOR).
export default function Profile() {
  const me = USERS[0];
  return (
    <div className="settings">
      <header className="settings-head">
        <a className="brand" href="/">
          <Logo /> NoteNest
        </a>
        <a className="back" href="/">← Back to notes</a>
      </header>

      <h1>Settings</h1>

      <section className="panel account">
        <span className="avatar big">{me.name[0]}</span>
        <div>
          <h2>{me.name}</h2>
          <p className="muted">{me.email}</p>
          <p>{me.bio}</p>
        </div>
      </section>

      <div className="panel-row">
        <section className="panel">
          <h2>Plan</h2>
          <p className="plan-name">{me.plan === "pro" ? "Pro" : "Free"}</p>
          <p className="muted">
            {me.plan === "pro" ? "$8/month · unlimited notes and AI" : "Up to 50 notes · upgrade for unlimited AI"}
          </p>
          <p className="muted small">Member since {new Date(me.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
        </section>
        <section className="panel">
          <h2>AI usage</h2>
          <p className="plan-name">${state.aiSpend.toFixed(2)}</p>
          <p className="muted">this month · {state.chatCalls} requests</p>
        </section>
      </div>

      <section className="panel">
        <h2>Workspace members</h2>
        <WorkspaceMembers />
      </section>
    </div>
  );
}
