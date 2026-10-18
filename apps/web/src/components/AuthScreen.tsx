import Link from "next/link";
import { safeNext } from "@/lib/auth";
import { AuthStage } from "./AuthStage";
import { Mark } from "./Mark";
import "./auth.css";

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export function AuthScreen({ mode, error, next }: { mode: "login" | "signup"; error?: string; next?: string }) {
  const dest = encodeURIComponent(safeNext(next));
  const github = `/api/auth/github?next=${dest}`;
  const google = `/api/auth/google?next=${dest}&fail=${mode === "signup" ? "/signup" : "/login"}`;
  const other = mode === "login" ? `/signup?next=${dest}` : `/login?next=${dest}`;

  return (
    <div className={`auth ${mode}`}>
      <div className="auth-pane">
        <div className="auth-card">
          <Link href="/" className="auth-logo" aria-label="Antibody home"><Mark size={mode === "login" ? 42 : 28} /></Link>
          <h1>{mode === "login" ? "Log in to Antibody" : "Sign up for Antibody"}</h1>
          {mode === "signup" ? <p className="auth-sub">Paste a URL. Antibody scans it, writes a fix you approve, blocks the attack, and texts you.</p> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <div className="auth-actions">
            <a className="auth-btn" href={github}><GithubIcon />Continue with GitHub</a>
            <a className="auth-btn" href={google}><GoogleIcon />Continue with Google</a>
          </div>
          <hr className="auth-rule" />
          {mode === "login" ? (
            <p className="auth-switch">Don&apos;t have an account yet? <Link href={other}>Sign up</Link></p>
          ) : (
            <>
              <p className="auth-switch">Already have an account? <Link href={other}>Log in</Link></p>
              <p className="auth-fine">Active probing only runs against domains you verify.</p>
            </>
          )}
        </div>
      </div>
      {mode === "signup" ? <AuthStage /> : null}
    </div>
  );
}
