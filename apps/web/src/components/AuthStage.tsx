"use client";

import { useEffect, useState } from "react";
import { STORIES } from "./story";

export function AuthStage() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setI((n) => (n + 1) % STORIES.length), 4200);
    return () => window.clearInterval(timer);
  }, []);

  const story = STORIES[i] ?? STORIES[0];
  return (
    <aside className="auth-stage" aria-label="How Antibody works">
      <div className="auth-frame" key={story.title}>{story.visual}</div>
      <p className="auth-caption"><b>{story.title}</b><span>{story.line}</span></p>
      <div className="auth-dots">
        {STORIES.map((item, n) => (
          <button key={item.title} type="button" aria-label={item.title} aria-current={n === i ? "true" : undefined} onClick={() => setI(n)} />
        ))}
      </div>
    </aside>
  );
}
