import { FixWell, ScanWell, ShieldWell, TextWell } from "./stages";

function Points({ items }: { items: { title: string; body: string; d: string }[] }) {
  return (
    <ul className="points">
      {items.map((item) => (
        <li key={item.title}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d={item.d} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <b>{item.title}</b>
          <span>{item.body}</span>
        </li>
      ))}
    </ul>
  );
}

export function FeatureRow() {
  return (
    <>
      <section className="demos" id="how" aria-label="How each part works">
        <article className="demo tone-scan">
          <div>
            <span className="num">1</span>
            <h2>Scan</h2>
            <p className="blurb">A pass over the app. Each open door lights up.</p>
            <Points items={[
              { title: "The bundle", body: "Reads the JavaScript for an API key that shipped to the browser.", d: "M4 8 a2.2 2.2 0 1 0 4.4 0 a2.2 2.2 0 1 0 -4.4 0 M8.4 8 H14 M11.5 8 V10.2 M14 8 V10.2" },
              { title: "Supabase", body: "Asks the database API whether every row is public.", d: "M2.5 2.5 H13.5 V13.5 H2.5 Z M2.5 6.2 H13.5 M2.5 9.8 H13.5 M6.2 2.5 V13.5" },
              { title: "Your routes", body: "Calls admin and user APIs with no session.", d: "M2.5 4 H13.5 M2.5 8 H10 M2.5 12 H13.5" },
            ]} />
          </div>
          <div className="slot"><ScanWell /></div>
        </article>

        <article className="demo fix">
          <div>
            <span className="num">2</span>
            <h2>Fix</h2>
            <p className="blurb">The patch lands. The checks pass. You approve.</p>
            <Points items={[
              { title: "Factory Droid", body: "Writes the patch from the finding.", d: "M8 2 L14 5.2 L8 8.4 L2 5.2 Z M2 8 L8 11.2 L14 8 M2 10.8 L8 14 L14 10.8" },
              { title: "GitHub", body: "Holds the patch until you approve it.", d: "M4 3.2 a1.3 1.3 0 1 0 0.1 0 M4 12.2 a1.3 1.3 0 1 0 0.1 0 M12 6.2 a1.3 1.3 0 1 0 0.1 0 M4 4.6 V10.8 M4 8 H9.2 A2 2 0 0 0 11.2 6 V4.8" },
            ]} />
          </div>
          <div className="slot"><FixWell /></div>
        </article>

        <article className="demo tone-shield">
          <div>
            <span className="num">3</span>
            <h2>Shield</h2>
            <p className="blurb">Ordinary traffic goes through. The dump stops.</p>
            <Points items={[
              { title: "Chalk", body: "Scores each request before the route runs.", d: "M8 1.6 L14 8 L8 14.4 L2 8 Z" },
              { title: "If Chalk is quiet", body: "The request still goes through.", d: "M2 8 H13 M9.2 4.4 L13 8 L9.2 11.6" },
            ]} />
          </div>
          <div className="slot"><ShieldWell /></div>
        </article>

        <article className="demo tone-text">
          <div>
            <span className="num">4</span>
            <h2>Text</h2>
            <p className="blurb">One message. You reply YES.</p>
            <Points items={[
              { title: "Photon", body: "Sends the iMessage, and reads the YES that comes back.", d: "M2 3 H14 V10.2 H9.2 L6.4 13 V10.2 H2 Z" },
              { title: "ElevenLabs", body: "Places the call when a text is not enough.", d: "M5.2 1.6 H10.8 V14.4 H5.2 Z M8 12.2 V12.3" },
            ]} />
          </div>
          <div className="slot"><TextWell /></div>
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
