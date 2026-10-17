import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import "@/components/home/home.css";
import "./globals.css";

const sans = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Antibody",
  description: "Scan a URL, write a fix you approve, block the live attack, and text you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 rounded bg-mint px-3 py-2 text-ink">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">{children}</main>
        <footer className="mx-auto flex w-[min(1120px,calc(100%-48px))] flex-wrap items-center justify-between gap-3 border-t border-white/10 py-7 text-[13px] text-[#6e726b]">
          <span>Antibody, HackHarvard. Active probing only runs against verified domains.</span>
          <Link href="/evals" className="hover:text-[#e4e6e1]">Eval scoreboard</Link>
        </footer>
      </body>
    </html>
  );
}
