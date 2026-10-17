import VibeClient from "./_components/VibeClient.tsx";
import LoginForm from "./_components/LoginForm.tsx";
import { USERS } from "./lib/seed.ts";
import { state } from "./lib/state.ts";

// Server component: pulls the "signed-in" user's notes (demo: always user 1) + current AI spend.
export default function Home() {
  const me = USERS[0];
  return (
    <>
      <div className="hero">
        <h1>Welcome back, {me.name.split(" ")[0]}</h1>
        <p>NoteNest keeps your notes in sync across every device.</p>
      </div>
      <LoginForm />
      <VibeClient notes={me.notes} initialSpend={state.aiSpend} />
    </>
  );
}
