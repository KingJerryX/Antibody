"use client";

import { useEffect, useState } from "react";
import { STEPS } from "./data";

const LINKS = [
  { id: "path", n: "", name: "The path", text: "Five steps" },
  ...STEPS.map((step) => ({ id: step.id, n: step.n, name: step.name, text: step.nav })),
];

export function DocsNav() {
  const [current, setCurrent] = useState("path");

  useEffect(() => {
    const nodes = LINKS.map((link) => document.getElementById(link.id)).filter((node): node is HTMLElement => !!node);
    const mark = () => {
      const nav = document.querySelector(".docs-nav");
      const box = nav?.getBoundingClientRect();
      // A section counts once its heading sits just under the sticky bar.
      const line = (box && box.height < 80 ? box.bottom : 88) + 48;
      let id = "path";
      for (const node of nodes) {
        if (node.getBoundingClientRect().top <= line) id = node.id;
      }
      setCurrent((prev) => (prev === id ? prev : id));
    };
    mark();
    window.addEventListener("scroll", mark, { passive: true });
    window.addEventListener("hashchange", mark);
    return () => {
      window.removeEventListener("scroll", mark);
      window.removeEventListener("hashchange", mark);
    };
  }, []);

  return (
    <nav className="docs-nav" aria-label="Docs">
      <p className="kicker">Docs</p>
      {LINKS.map((link) => (
        <div key={link.id} className="docs-nav-item">
          <a href={`#${link.id}`} aria-current={current === link.id ? "true" : undefined}>
            <b>{link.n}</b>
            <span>
              {link.name}
              <small>{link.text}</small>
            </span>
          </a>
        </div>
      ))}
    </nav>
  );
}
