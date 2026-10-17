import { USERS } from "../lib/seed.ts";

// Demo profile page. Note the client can also just hit /api/users/<any id> directly (IDOR).
export default function Profile() {
  const me = USERS[0];
  return (
    <div className="card">
      <h2>{me.name}</h2>
      <p className="muted">{me.email}</p>
      <p>{me.bio}</p>
      <p className="muted">Plan: {me.plan} · joined {new Date(me.createdAt).toLocaleDateString()}</p>
      <p className="muted small">
        Tip for the demo: try <code>/api/users/2</code> — any profile loads with no auth.
      </p>
    </div>
  );
}
