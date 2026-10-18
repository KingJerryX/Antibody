"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Mark } from "./Mark";

export function SiteHeader() {
  return (
    <Suspense fallback={<Header path="" />}>
      <HeaderWithPath />
    </Suspense>
  );
}

function HeaderWithPath() {
  return <Header path={usePathname()} />;
}

function Header({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Who's signed in. Null until /api/auth/me answers.
  const [me, setMe] = useState<{ user: { login: string; avatar?: string; mock?: boolean } | null; signIn: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then(setMe, () => setMe(null));
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = () => setOpen(false);
  const tab = (href: string, label: string) => {
    const on = path === href || (href !== "/" && path.startsWith(`${href}/`));
    return (
      <Link href={href} aria-current={on ? "page" : undefined} className={`rounded-full px-3 py-2 hover:text-[#e4e6e1] ${on ? "text-[#e4e6e1]" : "text-[#9b9e96]"}`} onClick={close}>
        {label}
      </Link>
    );
  };
  const account = me?.user ? (
    <>
      <span className="inline-flex items-center gap-2 px-3 py-1 text-[#e4e6e1]">
        {me.user.avatar && <img src={me.user.avatar} alt="" width={22} height={22} className="rounded-full" />}
        {me.user.login}{me.user.mock ? " (mock sign-in)" : ""}
      </span>
      <form action="/api/auth/logout" method="post">
        <button className="rounded-full px-3 py-1 text-[#e4e6e1] hover:bg-white/5">Sign out</button>
      </form>
    </>
  ) : me ? (
    <>
      <Link href="/login" className="inline-flex items-center rounded-full px-3 py-1 text-[#e4e6e1] hover:bg-white/5" onClick={close}>Log in</Link>
      <Link href="/signup" className="inline-flex items-center rounded-full bg-[#e3e5e1] px-3 py-1 font-medium text-[#10120f] hover:bg-white" onClick={close}>Sign up</Link>
    </>
  ) : null;

  return (
    <header className={`sticky top-0 z-40 flex items-center justify-between gap-4 px-7 py-3.5 backdrop-blur-xl max-[860px]:px-4 ${scrolled ? "border-b border-white/10" : "border-b border-transparent"}`} style={{ background: "rgba(16, 18, 16, 0.72)" }}>
      <Link href="/" className="flex items-center gap-2.5 text-lg tracking-tight text-[#e4e6e1]" aria-label="Antibody home">
        <Mark />
        Antibody
      </Link>
      <nav id="nav" aria-label="Main" className={`${open ? "flex" : "max-[860px]:hidden"} min-[861px]:absolute min-[861px]:left-1/2 min-[861px]:top-1/2 min-[861px]:flex min-[861px]:-translate-x-1/2 min-[861px]:-translate-y-1/2 max-[860px]:absolute max-[860px]:left-0 max-[860px]:right-0 max-[860px]:top-full max-[860px]:flex-col max-[860px]:border-b max-[860px]:border-white/10 max-[860px]:bg-[#101210]/95 max-[860px]:px-4 max-[860px]:py-2 items-center gap-1 text-sm`}>
        <Link href="/#scan-job" className="rounded-full px-3 py-2 text-[#9b9e96] hover:text-[#e4e6e1]" onClick={close}>Product</Link>
        {tab("/features", "Features")}
        {tab("/docs", "Docs")}
        {tab("/evals", "Evals")}
        {me?.user ? <Link href="/sites" className="rounded-full px-3 py-2 text-[#9b9e96] hover:text-[#e4e6e1]" onClick={close}>Your sites</Link> : null}
        <Link href="/#scan" className="ml-2 inline-flex items-center rounded-full bg-white px-3.5 py-2 text-sm text-[#141614] hover:bg-[#f3f4f0]" onClick={close}>Scan</Link>
        <div className="mt-1 flex items-center gap-1 min-[861px]:hidden">{account}</div>
      </nav>
      <div className="hidden items-center gap-1 text-sm min-[861px]:flex">{account}</div>
      <button type="button" className="rounded-full px-3 py-2 text-sm text-[#9b9e96] min-[861px]:hidden" aria-expanded={open} aria-controls="nav" onClick={() => setOpen((v) => !v)}>
        Menu
      </button>
    </header>
  );
}
