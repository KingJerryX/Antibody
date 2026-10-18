import Link from "next/link";
import { FixCard, ScanCard, ShieldCard, TextCard } from "@/components/story";

export const metadata = { title: "Docs | Antibody" };

const STEPS = [
  { n: "1", name: "Paste", text: "You give Antibody a URL." },
  { n: "2", name: "Scan", text: "Open doors light up." },
  { n: "3", name: "Fix", text: "A patch waits for you." },
  { n: "4", name: "Shield", text: "The bad request stops." },
  { n: "5", name: "Text", text: "You reply YES." },
];

export default function DocsPage() {
  return (
    <div className="ab">
      <div className="wrap page docs">
        <nav className="crumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span>Docs</span>
        </nav>
        <p className="kicker">Docs</p>
        <h1 className="display">How Antibody works</h1>
        <p className="sub">You paste a URL. Antibody looks for the open doors, writes a fix, stops the attack, and texts you to approve.</p>

        <ol className="docs-flow">
          {STEPS.map((step) => (
            <li key={step.n}><b>{step.n}</b><span className="docs-name">{step.name}<small>{step.text}</small></span></li>
          ))}
        </ol>

        <section className="docs-step">
          <div>
            <p className="kicker">Scan</p>
            <h2>It looks at the app the way a visitor does.</h2>
            <p>Antibody reads the page and the JavaScript that shipped with it. A key left in that bundle shows up. So does a database that answers anyone, and an admin route that works with no login. A domain you have not verified gets this read-only look. Active checks run only after you prove the site is yours.</p>
          </div>
          <ScanCard />
        </section>

        <section className="docs-step">
          <div>
            <p className="kicker">Fix</p>
            <h2>The patch sits until you say yes.</h2>
            <p>Antibody writes a change from what the scan found. The checks run against that change. Nothing merges on its own. You approve it on the site, or by text.</p>
          </div>
          <FixCard />
        </section>

        <section className="docs-step">
          <div>
            <p className="kicker">Shield</p>
            <h2>Ordinary visits go through. A dump does not.</h2>
            <p>Each request is scored before the route runs. A normal page load is allowed. A request that tries to take the whole table is blocked. If the scorer cannot be reached, the request is still allowed.</p>
          </div>
          <ShieldCard />
        </section>

        <section className="docs-step">
          <div>
            <p className="kicker">Text</p>
            <h2>One message. You reply YES.</h2>
            <p>When a fix is ready, or an attack was blocked, Antibody texts you. The reply that approves a fix is YES, with the fix id. If a text is not enough, it can call.</p>
          </div>
          <TextCard />
        </section>

        <p className="docs-next">Ready to try it? <Link href="/#scan">Scan a URL</Link>.</p>
      </div>
    </div>
  );
}
