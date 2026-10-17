import Link from "next/link";
import { Suspense } from "react";
import { ScanForm } from "@/components/ScanForm";
import { FeatureRow } from "@/components/home/FeatureRow";
import { HomeMotion } from "@/components/home/HomeMotion";
import { securityScore } from "@/lib/score";
import { readStore } from "@/lib/server";

const NAMES: [string, string][] = [
  ["Photon", "iMessage and voice"],
  ["Chalk", "Live scoring"],
  ["Factory Droid", "Fixes"],
  ["GitHub", "The patch"],
  ["ElevenLabs", "The call"],
];

export default function Home() {
  return (
    <div className="ab">
      <HomeMotion />
      <div className="wrap hero" id="scan">
        <div>
          <h1>Security for the app you just shipped.</h1>
          <p className="lede">Paste a URL. Antibody scans it, writes a fix you approve, blocks the live attack, and texts you.</p>
        </div>
        <ScanForm />
      </div>
      <canvas className="mark" id="mark" aria-hidden="true" />
      <div className="marquee" aria-label="Built on">
        <div className="track">
          {[...NAMES, ...NAMES].map(([n, r], i) => (
            <span key={`${n}-${i}`}>{n}<small>{r}</small></span>
          ))}
        </div>
      </div>
      <FeatureRow />
      <section className="pages" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <p className="kicker reveal">Pages</p>
          <h2 className="display reveal">Open one.</h2>
          <Suspense fallback={<p className="sub">Loading projects…</p>}>
            <OpenCards />
          </Suspense>
        </div>
      </section>
      <section className="close">
        <div className="wrap">
          <h2>Scan a URL</h2>
          <p className="sub" style={{ marginBottom: 16 }}>The report is the next screen. Unverified domains get a passive, read-only check.</p>
          <ScanForm />
        </div>
      </section>
    </div>
  );
}

async function OpenCards() {
  const db = await readStore();
  const scan = [...db.scans].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const fix = db.fixes.at(-1);
  const project = [...db.projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const score = scan ? securityScore(scan.findings, scan.skipped) : null;
  const host = scan ? (URL.parse(scan.targetUrl)?.host ?? scan.targetUrl) : null;

  return (
    <div className="cards">
      <Link className="card reveal" href={scan ? `/report/${scan.id}` : "/#scan"}>
        <div className="ring-row">
          <span className="big">{score ?? "—"}</span>
          {score !== null && score < 55 && <span className="sev critical">At risk</span>}
        </div>
        <h3>Report</h3>
        <p>{host ? `${scan!.findings.length} findings on ${host}.` : "Scan a URL. The report is the next screen."}</p>
      </Link>
      <Link className="card reveal" href={fix ? `/fix/${fix.id}` : "/#scan"}>
        <div className="mini">
          <div className="row"><span>exploit test</span><span className={fix?.checks.find((c) => c.name === "exploit_test")?.status === "pass" ? "good" : undefined}>{fix?.checks.find((c) => c.name === "exploit_test")?.status ?? "—"}</span></div>
          <div className="row"><span>behavior</span><span className={fix?.checks.find((c) => c.name === "behavior_tests")?.status === "pass" ? "good" : undefined}>{fix?.checks.find((c) => c.name === "behavior_tests")?.status ?? "—"}</span></div>
          <div className="row"><span>confidence</span><span>{fix?.confidence ?? "—"}</span></div>
        </div>
        <h3>Fix</h3>
        <p>{fix ? "Read it, then approve. The text goes out after you do." : "A fix shows up here after a scan finds something."}</p>
      </Link>
      <Link className="card reveal" href={project ? `/live/${project.id}` : "/#scan"}>
        <div className="mini">
          <div className="row"><span>project</span><span>{project?.name ?? "—"}</span></div>
          <div className="row"><span>domain</span><span>{project?.verifiedDomain ? "verified" : "—"}</span></div>
        </div>
        <h3>Live</h3>
        <p>The feed, the block, and the iMessage thread on one page.</p>
      </Link>
    </div>
  );
}
