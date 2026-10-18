import Link from "next/link";
import type { Metadata } from "next";
import { GROUPS } from "@/components/features/data";

export const metadata: Metadata = { title: "The checks | Antibody" };

const TOTAL = GROUPS.reduce((n, g) => n + g.count, 0);

export default function ChecksPage() {
  return (
    <>
      <p className="kicker">02 · The checks</p>
      <h1>One line per check.</h1>
      <p className="feat-lede">
        All {TOTAL} checks are one line, the same way a report lists them. Open a row for why it matters, then what the scan actually does.
      </p>

      <figure className="feat-mix" aria-label={`${GROUPS.map((g) => `${g.count} ${g.label}`).join(", ")}`}>
        <div className="feat-mix-bar">
          {GROUPS.map((group) => (
            <span key={group.id} className={`tone-${group.id}`} style={{ flexGrow: group.count }}>
              {group.count}
            </span>
          ))}
        </div>
        <figcaption>
          {GROUPS.map((group) => (
            <a key={group.id} href={`#${group.id}`}>
              <i className={`tone-${group.id}`} />
              {group.label}
              <b>{group.count}</b>
            </a>
          ))}
        </figcaption>
      </figure>

      {GROUPS.map((group) => (
        <section key={group.id} id={group.id} className="feat-group">
          <div className="feat-group-head">
            <h2>{group.label}</h2>
            <p>{group.when}</p>
          </div>
          <div className="feat-catalog">
            {group.items.map((item, i) => (
              <details key={item.title} className="feat-check" name="checks">
                <summary>
                  <span className="feat-idx">{String(i + 1).padStart(2, "0")}</span>
                  <span className="feat-check-title">{item.title}</span>
                </summary>
                <div className="feat-body">
                  <p className="feat-k">Why it matters</p>
                  <p className="feat-why">{item.why}</p>
                  <p className="feat-k">What the scan does</p>
                  <p className="feat-how">{item.how}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <p className="feat-next">
        Next: <Link href="/features/score">how the score is calculated</Link>
      </p>
    </>
  );
}
