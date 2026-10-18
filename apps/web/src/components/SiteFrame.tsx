"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteHeader } from "./SiteHeader";

const BARE = new Set(["/login", "/signup"]);

export function SiteFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (BARE.has(path)) return <main id="main" className="flex flex-1 flex-col">{children}</main>;
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <footer className="mx-auto flex w-[min(1120px,calc(100%-48px))] flex-wrap items-center justify-between gap-3 border-t border-white/10 py-7 text-[13px] text-[#6e726b]">
        <span>Antibody, HackHarvard. Active probing only runs against verified domains.</span>
        <span className="flex gap-4">
          <Link href="/docs" className="hover:text-[#e4e6e1]">Docs</Link>
          <Link href="/evals" className="hover:text-[#e4e6e1]">Eval scoreboard</Link>
        </span>
      </footer>
    </>
  );
}
