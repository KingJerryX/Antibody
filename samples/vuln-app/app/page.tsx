import NotesApp from "./_components/VibeClient.tsx";
import { USERS } from "./lib/seed.ts";
import { state } from "./lib/state.ts";

// Server component: the signed-in user's workspace (demo: always user 1) + current AI usage.
export default function Home() {
  const me = USERS[0];
  return <NotesApp name={me.name} notes={me.notes} initialSpend={state.aiSpend} />;
}
