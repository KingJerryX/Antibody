import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Guestlist",
  description: "Friday night on Ren's roof. You're on the list.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="demo-badge">Demo app · intentionally vulnerable</div>
        {children}
      </body>
    </html>
  );
}
