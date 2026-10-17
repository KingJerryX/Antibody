import LoginForm from "../_components/LoginForm.tsx";
import { Logo } from "../_components/VibeClient.tsx";

export const metadata = { title: "Sign in · NoteNest" };

export default function Login() {
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <Logo /> NoteNest
        </div>
        <h1>Welcome back</h1>
        <p className="muted">Your notes, synced everywhere, with an AI that actually reads them.</p>
        <LoginForm />
      </div>
      <p className="muted small">Demo account is prefilled. New here? Ask your workspace admin for an invite.</p>
    </div>
  );
}
