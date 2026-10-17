import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "NoteNest: your notes, everywhere",
  description: "Notes that sync everywhere, with an AI assistant built in.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Small but always visible: this app is deliberately insecure and must never be deployed. */}
        <div className="demo-badge">Demo app · intentionally vulnerable</div>
      </body>
    </html>
  );
}
