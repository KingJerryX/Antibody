import Link from "next/link";
import { SiteHeader } from "./SiteHeader";

/**
 * Header, page, footer. The log in / sign up screens (.auth) hide the header and footer through CSS (auth.css),
 * so this stays a server component: reading the path here (usePathname) broke prerendering of dynamic pages.
 */
export function SiteFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">{children}</main>
      <footer className="mx-auto flex w-[min(1120px,calc(100%-48px))] flex-wrap items-center justify-between gap-3 border-t border-white/10 py-7 text-[13px] text-[#6e726b]">
        <span>Antibody, HackHarvard. Active probing only runs against verified domains.</span>
        <span className="flex gap-4">
          <Link href="/docs" className="hover:text-[#e4e6e1]">Docs</Link>
          <Link href="/evals" className="hover:text-[#e4e6e1]">Eval scoreboard</Link>
          <Link href="/privacy" className="hover:text-[#e4e6e1]">Privacy</Link>
          <Link href="/terms" className="hover:text-[#e4e6e1]">Terms</Link>
        </span>
      </footer>
    </>
  );
}
