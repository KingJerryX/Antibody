import { ScanForm } from "@/components/ScanForm";
import { FeatureRow } from "@/components/home/FeatureRow";
import { HomeMotion } from "@/components/home/HomeMotion";
import { Aurora } from "@/components/home/Aurora";

const NAMES: [string, string][] = [
  ["Photon", "iMessage and voice"],
  ["Chalk", "Live scoring"],
  ["Factory Droid", "Fixes"],
  ["GitHub", "The patch"],
];

// Enough copies that one half of the track stays wider than a 4K viewport,
// so the loop has no empty stretch. Duration stays one set per 36s.
const SETS = 6;

export default function Home() {
  return (
    <div className="ab">
      <HomeMotion />
      {/* The aurora lives only in this top band, so the green stops at the partner bar. */}
      <div className="home-top">
        <Aurora />
        <div className="wrap hero" id="scan">
          <div>
            <h1>Security for <span className="accent">your production</span></h1>
            <p className="lede">Paste a URL. Antibody scans it, writes a fix you approve, blocks the live attack, and texts you.</p>
          </div>
          <ScanForm />
        </div>
        <canvas className="mark" id="mark" aria-hidden="true" />
        <div className="marquee" aria-label="Built on">
          <div className="track" style={{ animationDuration: `${36 * SETS}s` }}>
            {Array.from({ length: SETS * 2 }, (_, set) => (
              <div className="set" key={set} aria-hidden={set >= SETS ? true : undefined}>
                {NAMES.map(([n, r]) => (
                  <span key={n}>{n}<small>{r}</small></span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <FeatureRow />
    </div>
  );
}
