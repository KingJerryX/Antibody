import "./story.css";

export function PasteCard() {
  return (
    <div className="story-card" aria-hidden="true">
      <div className="story-bar"><span className="verb">scan</span><span>waiting for a URL</span></div>
      <div className="story-paste">
        <span>https://</span>
        <em>your-app.example</em>
        <b>Scan</b>
      </div>
      <p className="story-note">Read-only until the domain is verified.</p>
    </div>
  );
}

export function ScanCard() {
  return (
    <div className="story-card" aria-hidden="true">
      <div className="story-bar"><span className="verb">scan</span><span>3 open</span></div>
      <div className="story-body">
        <div className="story-row hot"><span>bundle.js</span><em>key in the page</em></div>
        <div className="story-row"><span>/users</span><em>every row is public</em></div>
        <div className="story-row"><span>/api/admin</span><em>no login</em></div>
      </div>
    </div>
  );
}

export function FixCard() {
  return (
    <div className="story-card" aria-hidden="true">
      <div className="story-bar"><span className="verb">fix</span><span>middleware.ts</span></div>
      <div className="story-body">
        <div className="story-line del">- key shipped in the browser</div>
        <div className="story-line add">+ key stays on the server</div>
      </div>
      <p className="story-foot">checks passed · waiting for you</p>
    </div>
  );
}

export function ShieldCard() {
  return (
    <div className="story-card" aria-hidden="true">
      <div className="story-bar"><span className="verb">shield</span><span>live</span></div>
      <div className="story-body">
        <div className="story-row"><span>GET /</span><em className="ok">allowed</em></div>
        <div className="story-row stop"><span>GET /users?dump</span><em>blocked</em></div>
        <div className="story-row"><span>scorer quiet</span><em className="ok">still allowed</em></div>
      </div>
    </div>
  );
}

export function TextCard() {
  return (
    <div className="story-card story-thread" aria-hidden="true">
      <div className="story-bar"><span className="verb">text</span><span>Antibody</span></div>
      <div className="story-body">
        <p className="story-bubble them">Fix is ready. Reply YES fix_18a.</p>
        <p className="story-bubble me">YES fix_18a</p>
      </div>
    </div>
  );
}

export const STORIES = [
  { title: "Paste", line: "You give Antibody a URL.", visual: <PasteCard /> },
  { title: "Scan", line: "Each open door lights up.", visual: <ScanCard /> },
  { title: "Fix", line: "The patch waits until you approve.", visual: <FixCard /> },
  { title: "Shield", line: "Ordinary traffic goes through. The dump stops.", visual: <ShieldCard /> },
  { title: "Text", line: "One message. You reply YES.", visual: <TextCard /> },
];
