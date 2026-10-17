import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/ui";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Antibody: security for vibe-coded apps",
  description: "Scan your app, get tested fixes, block live attacks, and hear about it over iMessage.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 rounded bg-mint px-3 py-2 text-ink">
          Skip to content
        </a>
        <header className="border-b border-line/80 bg-ink/70 backdrop-blur sticky top-0 z-40">
          <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-white">
              <Logo className="h-6 w-6 text-mint" />
              Antibody
            </Link>
            <div className="flex items-center gap-1 text-sm text-slate-300">
              <Link href="/#scan" className="rounded-md px-3 py-1.5 hover:bg-white/5 hover:text-white">Scan</Link>
              <Link href="/evals" className="rounded-md px-3 py-1.5 hover:bg-white/5 hover:text-white">Evals</Link>
            </div>
          </nav>
        </header>
        <main id="main" className="flex-1">{children}</main>
        <footer className="border-t border-line/80 py-6 text-center text-xs text-slate-500">
          Antibody, built at HackHarvard. Active probing only runs against verified domains.
        </footer>
      </body>
    </html>
  );
}
