const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

export function FeatureRow() {
  return (
    <>
      <section className="demos" id="how" aria-label="How each part works">
        <article className="demo tone-scan">
          <div>
            <span className="num">1</span>
            <h2>Scan</h2>
            <p className="blurb">A pass over the app. Each open door lights up.</p>
          </div>
          <div className="slot">
            <div className="well" style={{ "--r": "198px" } as React.CSSProperties}>
              <div className="orbit" aria-hidden="true">
                <span className="orb" style={i(0)}><svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="26" cy="32" r="4.5" /><path d="M30.5 32 H46 M40 32 V36 M46 32 V36" /></g></svg></span>
                <span className="orb" style={i(1)}><svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="22" y="22" width="20" height="20" rx="1.5" /><path d="M22 29 H42 M22 35 H42 M29 22 V42" /></g></svg></span>
                <span className="orb" style={i(2)}><svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="24" y="20" width="16" height="24" rx="1.5" /><circle cx="35" cy="32" r="1.2" fill="currentColor" stroke="none" /></g></svg></span>
                <span className="orb" style={i(3)}><svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 26 H44 V38 H34 L28 44 V38 H20 Z" /></g></svg></span>
                <span className="orb" style={i(4)}><svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="24" cy="32" r="1.7" fill="currentColor" stroke="none" /><circle cx="32" cy="32" r="1.7" fill="currentColor" stroke="none" /><circle cx="40" cy="32" r="1.7" fill="currentColor" stroke="none" /></g></svg></span>
                <span className="orb" style={i(5)}><svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="31" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.28" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 26 H42 M22 32 H36 M22 38 H42" /></g></svg></span>
              </div>
              <button className="cmd" type="button" aria-label="Run scan"><span className="verb">scan</span><span className="word" aria-hidden="true"><b>secret</b><b>users</b><b>admin</b></span><i className="flash" /></button>
            </div>
          </div>
        </article>

        <article className="demo fix">
          <div>
            <span className="num">2</span>
            <h2>Fix</h2>
            <p className="blurb">The patch lands. The checks pass. You approve.</p>
          </div>
          <div className="slot">
            <div className="well">
              <div className="pile" aria-hidden="true">
                <span className="slab" style={i(0)}><svg viewBox="0 0 64 64" width="64" height="64"><polygon points="32,4 58,18 58,46 32,60 6,46 6,18" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.45" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="32" cy="32" r="8" /><path d="M32 28 V36 M28 32 H36" /></g></svg></span>
                <span className="slab" style={i(1)}><svg viewBox="0 0 64 64" width="64" height="64"><polygon points="32,4 58,18 58,46 32,60 6,46 6,18" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.45" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 26 H42 M22 32 H36 M22 38 H42" /></g></svg></span>
                <span className="slab" style={i(2)}><svg viewBox="0 0 64 64" width="64" height="64"><polygon points="32,4 58,18 58,46 32,60 6,46 6,18" fill="#1a1c19" stroke="currentColor" strokeOpacity="0.45" /><g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M24 33 L30 39 L42 25" /></g></svg></span>
              </div>
              <button className="cmd" type="button" aria-label="Run fix"><span className="verb">fix</span><span className="word" aria-hidden="true"><b>patch</b><b>check</b><b>passed</b></span><i className="flash" /></button>
            </div>
          </div>
        </article>

        <article className="demo tone-shield">
          <div>
            <span className="num">3</span>
            <h2>Shield</h2>
            <p className="blurb">Ordinary traffic goes through. The dump stops.</p>
          </div>
          <div className="slot">
            <div className="well">
              <div className="lanes" aria-hidden="true">
                <span className="gate" />
                <span className="ticket go a">GET /</span>
                <span className="ticket go b">GET /account</span>
                <span className="ticket halt c">GET /users</span>
              </div>
              <button className="cmd" type="button" aria-label="Run shield"><span className="verb">shield</span><span className="word" aria-hidden="true"><b>allow</b><b>pass</b><b className="hot">block</b></span><i className="flash" /></button>
            </div>
          </div>
        </article>

        <article className="demo tone-text">
          <div>
            <span className="num">4</span>
            <h2>Text</h2>
            <p className="blurb">One message. You reply YES.</p>
          </div>
          <div className="slot">
            <div className="well">
              <svg className="arc" viewBox="0 0 100 78" aria-hidden="true">
                <path d="M50 66 C 58 34, 76 20, 80 34" />
                <circle className="mote-dot" cx="0" cy="0" r="1.7" fill="currentColor">
                  <animateMotion dur="1.15s" fill="freeze" begin="indefinite" path="M50 66 C 58 34, 76 20, 80 34" />
                </circle>
              </svg>
              <div aria-hidden="true">
                <span className="imsg a">Blocked a dump.</span>
                <span className="imsg b">Fix is ready.</span>
                <span className="imsg c">YES</span>
              </div>
              <button className="cmd" type="button" aria-label="Run text"><span className="verb">text</span><span className="word" aria-hidden="true"><b>sent</b><b>ready</b><b>YES</b></span><i className="flash" /></button>
            </div>
          </div>
        </article>
      </section>

      <section className="figs" id="scan-job" aria-label="What Antibody does">
        <div className="fig" tabIndex={0}>
          <span className="num">1</span>
          <svg className="glyph" viewBox="0 0 200 200" aria-hidden="true">
            <circle className="line" pathLength="1" cx="100" cy="100" r="72" />
            <line className="line" pathLength="1" x1="100" y1="28" x2="100" y2="172" />
            <line className="line" pathLength="1" x1="28" y1="100" x2="172" y2="100" />
            <rect className="line faint" pathLength="1" x="78" y="78" width="44" height="44" />
            <g className="sweep"><line x1="100" y1="100" x2="151" y2="49" stroke="#4fd2ff" strokeWidth="1.4" /></g>
            <circle className="dot" cx="100" cy="28" r="3.6" fill="#4fd2ff" />
            <circle className="dot" cx="172" cy="100" r="3.6" fill="#4fd2ff" />
            <circle className="dot" cx="100" cy="172" r="3.6" fill="#4fd2ff" />
            <circle className="dot" cx="28" cy="100" r="3.6" fill="#4fd2ff" />
          </svg>
          <h3>Scan</h3>
          <p>Finds the open doors.</p>
        </div>
        <div className="fig" tabIndex={0}>
          <span className="num">2</span>
          <svg className="glyph" viewBox="0 0 200 200" aria-hidden="true">
            <polygon className="line plane" pathLength="1" points="100,108 158,136 100,164 42,136" />
            <polygon className="line plane" pathLength="1" points="100,74 158,102 100,130 42,102" />
            <polygon className="line plane" pathLength="1" points="100,40 158,68 100,96 42,68" />
            <circle className="dot" cx="100" cy="40" r="3.6" fill="#ff8d5c" />
            <circle className="dot" cx="158" cy="68" r="3.6" fill="#ff8d5c" />
            <circle className="dot" cx="42" cy="68" r="3.6" fill="#ff8d5c" />
            <circle className="dot" cx="100" cy="96" r="3.6" fill="#ff8d5c" />
          </svg>
          <h3>Fix</h3>
          <p>Writes a patch that already works.</p>
        </div>
        <div className="fig" tabIndex={0}>
          <span className="num">3</span>
          <svg className="glyph" viewBox="0 0 200 200" aria-hidden="true">
            <polygon className="line" pathLength="1" points="100,28 168,64 168,136 100,172 32,136 32,64" />
            <line className="line" pathLength="1" x1="100" y1="28" x2="100" y2="100" />
            <line className="line" pathLength="1" x1="168" y1="64" x2="100" y2="100" />
            <line className="line" pathLength="1" x1="32" y1="64" x2="100" y2="100" />
            <rect className="line cube" pathLength="1" x="84" y="84" width="32" height="32" />
            <circle className="dot" cx="100" cy="28" r="3.4" fill="#b794f6" />
            <circle className="dot" cx="168" cy="64" r="3.4" fill="#b794f6" />
            <circle className="dot" cx="168" cy="136" r="3.4" fill="#b794f6" />
            <circle className="dot" cx="100" cy="172" r="3.4" fill="#b794f6" />
            <circle className="dot" cx="32" cy="136" r="3.4" fill="#b794f6" />
            <circle className="dot" cx="32" cy="64" r="3.4" fill="#b794f6" />
          </svg>
          <h3>Shield</h3>
          <p>Stops the request that shouldn’t land.</p>
        </div>
        <div className="fig" tabIndex={0}>
          <span className="num">4</span>
          <svg className="glyph" viewBox="0 0 200 200" aria-hidden="true">
            <path className="line" pathLength="1" d="M36 128 C70 36, 130 36, 164 128" />
            <circle className="dot" cx="36" cy="128" r="3.6" fill="#7fee64" />
            <circle className="dot end" cx="164" cy="128" r="4" fill="#7fee64" />
            <circle className="mover" r="3.6" fill="#7fee64" cx="36" cy="128" />
          </svg>
          <h3>Text</h3>
          <p>Tells you, in one message.</p>
        </div>
      </section>
    </>
  );
}
