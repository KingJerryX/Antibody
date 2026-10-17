"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-40 flex items-center justify-between gap-4 px-7 py-3.5 backdrop-blur-xl max-[860px]:px-4 ${scrolled ? "border-b border-white/10" : "border-b border-transparent"}`} style={{ background: "rgba(16, 18, 16, 0.72)" }}>
      <Link href="/" className="flex items-center gap-2.5 text-lg tracking-tight text-[#e4e6e1]" aria-label="Antibody home">
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="y-face" x1="4" y1="2" x2="26" y2="30" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#e9ffc8" />
              <stop offset="0.42" stopColor="#8cf26a" />
              <stop offset="1" stopColor="#2f8a2e" />
            </linearGradient>
            <linearGradient id="y-side" x1="16" y1="4" x2="20" y2="30" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#1c6424" />
              <stop offset="1" stopColor="#082810" />
            </linearGradient>
          </defs>
          <g strokeLinecap="round" strokeLinejoin="round">
            <g stroke="url(#y-side)" strokeWidth="6.1" transform="translate(0.85 1.25)">
              <path d="M16 27.2 V15.2" />
              <path d="M16 15.2 L6.4 5.2" />
              <path d="M16 15.2 L25.6 5.2" />
            </g>
            <g stroke="url(#y-face)" strokeWidth="5.15">
              <path d="M16 26.2 V14.6" />
              <path d="M16 14.6 L6.6 4.6" />
              <path d="M16 14.6 L25.4 4.6" />
            </g>
          </g>
        </svg>
        Antibody
      </Link>
      <button type="button" className="rounded-full px-3 py-2 text-sm text-[#9b9e96] min-[861px]:hidden" aria-expanded={open} aria-controls="nav" onClick={() => setOpen((v) => !v)}>
        Menu
      </button>
      <nav id="nav" aria-label="Main" className={`${open ? "flex" : "max-[860px]:hidden"} min-[861px]:flex max-[860px]:absolute max-[860px]:left-0 max-[860px]:right-0 max-[860px]:top-full max-[860px]:flex-col max-[860px]:border-b max-[860px]:border-white/10 max-[860px]:bg-[#101210]/95 max-[860px]:px-4 max-[860px]:py-2 items-center gap-1 text-sm`}>
        <Link href="/#scan-job" className="rounded-full px-3 py-2 text-[#9b9e96] hover:text-[#e4e6e1]" onClick={() => setOpen(false)}>Product</Link>
        <Link href="/evals" className="rounded-full px-3 py-2 text-[#9b9e96] hover:text-[#e4e6e1]" onClick={() => setOpen(false)}>Evals</Link>
        <a href="/api/github/connect" className="ml-2 inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-sm text-[#e4e6e1] hover:bg-white/10" onClick={() => setOpen(false)}>Connect GitHub</a>
        <Link href="/#scan" className="ml-2 inline-flex items-center rounded-full bg-white px-3.5 py-2 text-sm text-[#141614] hover:bg-[#f3f4f0]" onClick={() => setOpen(false)}>Scan</Link>
      </nav>
    </header>
  );
}
