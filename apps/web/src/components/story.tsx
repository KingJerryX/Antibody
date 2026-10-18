import "./story.css";

export function ScanCard() {
  return (
    <div className="story-card" aria-hidden="true">
      <div className="story-row hot"><span>bundle.js</span><em>key in the page</em></div>
      <div className="story-row"><span>/users</span><em>every row is public</em></div>
      <div className="story-row"><span>/api/admin</span><em>no login</em></div>
    </div>
  );
}

export function FixCard() {
  return (
    <div className="story-card" aria-hidden="true">
      <div className="story-line del">- key shipped in the browser</div>
      <div className="story-line add">+ key stays on the server</div>
      <div className="story-line dim">checks passed · waiting for you</div>
    </div>
  );
}

export function ShieldCard() {
  return (
    <div className="story-card" aria-hidden="true">
      <div className="story-row"><span>GET /</span><em className="ok">allowed</em></div>
      <div className="story-row stop"><span>GET /users?dump</span><em>blocked</em></div>
    </div>
  );
}

export function TextCard() {
  return (
    <div className="story-card story-thread" aria-hidden="true">
      <p className="story-bubble them">Fix is ready. Reply YES.</p>
      <p className="story-bubble me">YES</p>
    </div>
  );
}

export const STORIES = [
  { title: "Scan", line: "Each open door lights up.", visual: <ScanCard /> },
  { title: "Fix", line: "The patch waits until you approve.", visual: <FixCard /> },
  { title: "Shield", line: "Ordinary traffic goes through. The dump stops.", visual: <ShieldCard /> },
  { title: "Text", line: "One message. You reply YES.", visual: <TextCard /> },
];
