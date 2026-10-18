import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "How a scan runs | Antibody" };

const PASSES = [
  {
    n: "01",
    id: "visitor",
    name: "Visitor",
    when: "Any URL",
    text: "Fetches the page and the same-origin scripts. DNSSEC and DMARC are asked of a public resolver, not of the site.",
    count: 10,
  },
  {
    n: "02",
    id: "live",
    name: "Live",
    when: "You prove ownership",
    text: "Calls the API with no login. Proof is Connect Vercel, or the allowlist. Probes do not follow redirects.",
    count: 6,
  },
  {
    n: "03",
    id: "code",
    name: "Code",
    when: "GitHub is connected",
    text: "Reads the repo for the same holes in source: missing auth, missing limits, injection, and committed keys.",
    count: 6,
  },
];

const GRID: { situation: string; cells: ("Runs" | "Not run")[] }[] = [
  { situation: "A URL, nothing else", cells: ["Runs", "Not run", "Not run"] },
  { situation: "You prove you own it", cells: ["Runs", "Runs", "Not run"] },
  { situation: "The repo is connected", cells: ["Runs", "Not run", "Runs"] },
  { situation: "Both", cells: ["Runs", "Runs", "Runs"] },
];

export default function HowPage() {
  return (
    <>
      <p className="kicker">01 · How it runs</p>
      <h1>Three passes. Each one waits for permission.</h1>
      <p className="feat-lede">
        Antibody always reads what a visitor can already see. It calls the API only after you prove the site is yours, and it reads the repo only after GitHub is connected.
      </p>

      <ol className="feat-passes">
        {PASSES.map((pass) => (
          <li key={pass.n}>
            <Link href={`/features/checks#${pass.id}`}>
              <p className="feat-when">{pass.n} · {pass.when}</p>
              <h2>{pass.name}</h2>
              <p>{pass.text}</p>
              <span className="feat-count">{pass.count} checks</span>
            </Link>
          </li>
        ))}
      </ol>

      <h2 className="feat-sub">What actually runs</h2>
      <p className="feat-note">Live and code are separate. Connecting GitHub does not turn on the API probes, and proving ownership does not read the repo.</p>
      <div className="feat-table-wrap">
        <table className="feat-table">
          <caption>Which passes run in each situation</caption>
          <thead>
            <tr>
              <th scope="col">You have</th>
              <th scope="col">Visitor</th>
              <th scope="col">Live</th>
              <th scope="col">Code</th>
            </tr>
          </thead>
          <tbody>
            {GRID.map((row) => (
              <tr key={row.situation}>
                <th scope="row">{row.situation}</th>
                {row.cells.map((cell, i) => (
                  <td key={i} className={cell === "Runs" ? "is-on" : "is-off"}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <aside className="feat-callout">
        <strong>Not run is its own result.</strong>
        <p>A check that did not run stays out of the passed list. A DNS lookup that fails is not run, so a resolver outage is not reported as a missing record. Localhost and raw IP addresses skip DNSSEC and DMARC, because there is no domain to sign.</p>
      </aside>

      <p className="feat-next">
        Next: <Link href="/features/checks">the 22 checks</Link>
      </p>
    </>
  );
}
