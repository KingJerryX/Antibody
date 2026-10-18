import Link from "next/link";
import type { Metadata } from "next";
import { BANDS, DEDUCTIONS, EXAMPLES } from "@/components/features/data";

export const metadata: Metadata = { title: "The score | Antibody" };

const MAX_HIT = Math.max(...DEDUCTIONS.map((d) => d.points));

export default function ScorePage() {
  return (
    <>
      <p className="kicker">03 · The score</p>
      <h1>The score starts at 100.</h1>
      <p className="feat-lede">
        Findings stack. A scan that never called the API costs another 15. Nothing goes below 0.
      </p>
      <p className="feat-rule" aria-label="Start at 100, subtract each finding, subtract 15 if live checks never ran. The floor is 0.">
        <span><b>100</b> − findings − <b>15</b></span>
        <span>floor <b>0</b></span>
      </p>

      <section className="feat-block" aria-labelledby="price-heading">
        <h2 id="price-heading">What each result costs</h2>
        <ul className="feat-prices">
          {DEDUCTIONS.map((row) => (
            <li key={row.label}>
              <span>{row.label}</span>
              <span className="feat-track" role="img" aria-label={`${row.label}, minus ${row.points}`}>
                <i className={`tone-${row.tone}`} style={{ width: `${(row.points / MAX_HIT) * 100}%` }} />
              </span>
              <b>−{row.points}</b>
            </li>
          ))}
        </ul>
      </section>

      <section className="feat-block" aria-labelledby="band-heading">
        <h2 id="band-heading">Where a score lands</h2>
        <figure className="feat-scale" aria-label="0 to 54 is at risk, 55 to 84 needs work, 85 to 100 is strong">
          <div className="feat-scale-bar">
            {BANDS.map((band) => (
              <span key={band.label} className={`tone-${band.tone}`} style={{ flexGrow: band.span }}>
                {band.range}
              </span>
            ))}
          </div>
          <figcaption>
            {BANDS.map((band) => (
              <span key={band.label}>
                <i className={`tone-${band.tone}`} />
                {band.label}
              </span>
            ))}
          </figcaption>
        </figure>
        <p className="feat-note">A homepage-only scan with nothing found scores 85. That is the bottom of Strong, because the live checks did not run.</p>
      </section>

      <section className="feat-block" aria-labelledby="examples-heading">
        <h2 id="examples-heading">Three real totals</h2>
        <p className="feat-note">Each bar is the full 100. The bright part is the score that remains. The rest is what was subtracted.</p>
        <ul className="feat-examples">
          {EXAMPLES.map((example) => (
            <li key={example.name}>
              <div className="feat-example-top">
                <span>{example.name}</span>
                <b className={`tone-text-${example.tone}`}>{example.score}</b>
              </div>
              <div className="feat-stack" role="img" aria-label={example.parts.map((part) => `${part.label} ${part.points}`).join(", ")}>
                {example.parts.map((part) => (
                  <span key={part.label} className={`tone-${part.tone}`} style={{ flexGrow: part.points }} title={`${part.label}: ${part.points}`} />
                ))}
              </div>
              <p>
                {example.parts
                  .filter((part) => part.tone !== "keep")
                  .map((part) => `−${part.points} ${part.label.toLowerCase()}`)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
        <ul className="feat-legend">
          <li><i className="tone-keep" />Score that remains</li>
          <li><i className="tone-work" />Low or medium</li>
          <li><i className="tone-risk" />High or critical</li>
          <li><i className="tone-skip" />Live checks not run</li>
        </ul>
      </section>

      <aside className="feat-callout">
        <strong>The report lists every check.</strong>
        <p>Passed, failed, and not run are separate. The number above is how the findings, and a scan that never called the API, move the score.</p>
      </aside>

      <p className="feat-next">
        <Link href="/#scan">Scan a URL</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/features">Back to how a scan runs</Link>
      </p>
    </>
  );
}
