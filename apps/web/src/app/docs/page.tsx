import Link from "next/link";
import type { Metadata } from "next";
import { FixCard, PasteCard, ScanCard, ShieldCard, TextCard } from "@/components/story";
import { STEPS } from "@/components/docs/data";

export const metadata: Metadata = { title: "How Antibody works | Antibody" };

const CARDS = {
  paste: PasteCard,
  scan: ScanCard,
  fix: FixCard,
  shield: ShieldCard,
  text: TextCard,
} as const;

export default function DocsPage() {
  return (
    <>
      <section id="path" className="docs-anchor">
        <p className="kicker">The path</p>
        <h1>Five steps. Each one waits its turn.</h1>
        <p className="docs-lede">
          You paste a URL. Antibody looks for the open doors, writes a fix, stops the attack, and texts you to approve.
        </p>
      </section>

      {STEPS.map((step) => {
        const Card = CARDS[step.id as keyof typeof CARDS];
        return (
          <section key={step.id} id={step.id} className="docs-step docs-anchor">
            <p className="kicker">{step.n} · {step.name}</p>
            <h2>{step.title}</h2>
            <p className="docs-lede">{step.body}</p>
            <div className="docs-stage">
              <Card />
            </div>
            <aside className="docs-callout">
              <strong>{step.note}</strong>
              <p>
                {step.noteText}
                {step.id === "scan" && (
                  <>
                    {" "}
                    See <Link href="/features/checks">the 22 checks</Link>
                    {" and "}
                    <Link href="/features/score">the score</Link>.
                  </>
                )}
              </p>
            </aside>
          </section>
        );
      })}

      <div className="docs-close">
        <div>
          <h2>Ready to try it?</h2>
          <p>Unverified domains get a passive, read-only check.</p>
        </div>
        <Link href="/#scan" className="btn btn-light">Scan a URL</Link>
      </div>
    </>
  );
}
