import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "NoteNest — your notes, everywhere",
  description: "A tiny notes app (intentionally vulnerable demo).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="banner">
          Demo app — intentionally vulnerable. Do not deploy. Built to be hacked on stage.
        </div>
        <header className="topbar">
          <div className="brand">
            <span className="logo">▧</span> NoteNest
          </div>
          <nav>
            <a href="/">Notes</a>
            <a href="/profile">Profile</a>
          </nav>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
