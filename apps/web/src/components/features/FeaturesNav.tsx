"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GROUPS } from "./data";

const LINKS = [
  { href: "/features", name: "How it runs", text: "Three passes" },
  { href: "/features/checks", name: "The checks", text: "22 checks" },
  { href: "/features/score", name: "The score", text: "Points off 100" },
];

export function FeaturesNav() {
  const path = usePathname();
  const [hash, setHash] = useState("");
  const onChecks = path === "/features/checks" || path.startsWith("/features/checks/");

  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [path]);

  return (
    <nav className="feat-nav" aria-label="Features">
      <p className="kicker">Features</p>
      {LINKS.map((link, i) => {
        const on = link.href === "/features" ? path === "/features" : path.startsWith(link.href);
        return (
          <div key={link.href} className="feat-nav-item">
            <Link href={link.href} aria-current={on ? "page" : undefined}>
              <b>0{i + 1}</b>
              <span>
                {link.name}
                <small>{link.text}</small>
              </span>
            </Link>
            {link.href === "/features/checks" && (
              <div className="feat-sub">
                {GROUPS.map((group) => (
                  <Link
                    key={group.id}
                    href={`/features/checks#${group.id}`}
                    aria-current={onChecks && hash === `#${group.id}` ? "location" : undefined}
                    onClick={() => setHash(`#${group.id}`)}
                  >
                    {group.nav}
                    <small>{group.count}</small>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
