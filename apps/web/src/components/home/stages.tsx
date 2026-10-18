const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

export function ScanWell() {
  return (
    <div className="well" style={{ "--r": "198px" } as React.CSSProperties}>
      <div className="orbit">
        <span className="orb" data-slot="0" style={i(0)} role="img" aria-label="Secret"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="26" cy="32" r="4.5" /><path d="M30.5 32 H46 M40 32 V36 M46 32 V36" /></g></svg><span className="tip">Secret</span></span>
        <span className="orb" data-slot="1" style={i(1)} role="img" aria-label="Database"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="22" y="22" width="20" height="20" rx="1.5" /><path d="M22 29 H42 M22 35 H42 M29 22 V42" /></g></svg><span className="tip">Database</span></span>
        <span className="orb" data-slot="2" style={i(2)} role="img" aria-label="Phone"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="24" y="20" width="16" height="24" rx="1.5" /><circle cx="35" cy="32" r="1.2" fill="currentColor" stroke="none" /></g></svg><span className="tip">Phone</span></span>
        <span className="orb" data-slot="3" style={i(3)} role="img" aria-label="Chat"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 26 H44 V38 H34 L28 44 V38 H20 Z" /></g></svg><span className="tip">Chat</span></span>
        <span className="orb" data-slot="4" style={i(4)} role="img" aria-label="More"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="32" r="1.7" fill="currentColor" stroke="none" /><circle cx="32" cy="32" r="1.7" fill="currentColor" stroke="none" /><circle cx="40" cy="32" r="1.7" fill="currentColor" stroke="none" /></g></svg><span className="tip">More</span></span>
        <span className="orb" data-slot="5" style={i(5)} role="img" aria-label="Menu"><svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 26 H42 M22 32 H36 M22 38 H42" /></g></svg><span className="tip">Menu</span></span>
      </div>
      <button className="cmd" type="button" aria-label="Run scan"><span className="verb">scan</span><span className="word" aria-hidden="true"><b>secret</b><b>users</b><b>admin</b></span><i className="flash" /></button>
    </div>
  );
}

export function FixWell() {
  return (
    <div className="well">
      <canvas className="stage" aria-hidden="true" />
      <button className="cmd" type="button" aria-label="Run fix"><span className="verb">fix</span><span className="word" aria-hidden="true"><b>patch</b><b>check</b><b>passed</b></span><i className="flash" /></button>
    </div>
  );
}

export function ShieldWell() {
  return (
    <div className="well">
      <canvas className="stage" aria-hidden="true" />
      <button className="cmd" type="button" aria-label="Run shield"><span className="verb">shield</span><span className="word" aria-hidden="true"><b>allow</b><b>pass</b><b className="hot">block</b></span><i className="flash" /></button>
    </div>
  );
}

export function TextWell() {
  return (
    <div className="well">
      <div className="thread" aria-hidden="true">
        <div className="im-bar">
          <span className="im-back">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" d="M15 5 L8 12 L15 19" /></svg>
          </span>
          <span className="im-person">
            <span className="im-ava">J</span>
            <b>Jerry</b>
          </span>
          <span className="im-video">
            <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M3.5 8.2h9.2a1.4 1.4 0 0 1 1.4 1.4v5.8a1.4 1.4 0 0 1-1.4 1.4H3.5a1.4 1.4 0 0 1-1.4-1.4V9.6a1.4 1.4 0 0 1 1.4-1.4zm12.2 1.7 5.2-2.4v9l-5.2-2.4v-4.2z" /></svg>
          </span>
        </div>
        <div className="call">
          <span className="phone">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7 3.6h2.1l1.1 2.8-1.6 1a8.2 8.2 0 0 0 4 4l1-1.6 2.8 1.1V13a1.2 1.2 0 0 1-1.2 1.2A12.6 12.6 0 0 1 5.8 4.8 1.2 1.2 0 0 1 7 3.6z" /></svg>
          </span>
          <span className="who"><b>Jerry</b><small>Live call</small></span>
          <span className="live"><i />Live</span>
        </div>
        <div className="log">
          <div className="row out a"><div className="fit"><p>Blocked a dump.</p></div></div>
          <div className="row out b"><div className="fit"><p>Fix is ready. Reply YES.</p><small><b>Delivered</b><b>Read</b></small></div></div>
          <div className="row typing"><div className="fit"><p><i /><i /><i /></p></div></div>
          <div className="row in"><div className="fit"><p>YES</p></div></div>
        </div>
      </div>
      <canvas className="stage" aria-hidden="true" />
    </div>
  );
}

export const FEATURES = [
  { title: "Scan", line: "Each open door lights up.", tone: "tone-scan", color: "#56d8ff", Well: ScanWell },
  { title: "Fix", line: "The patch lands. The checks pass. You approve.", tone: "fix", color: "#ff8d5c", Well: FixWell },
  { title: "Shield", line: "Ordinary traffic goes through. The dump stops.", tone: "tone-shield", color: "#b794f6", Well: ShieldWell },
  { title: "Text", line: "One message. You reply YES.", tone: "tone-text", color: "#7fee64", Well: TextWell },
] as const;
