import { useEffect, useMemo, useState } from "react";
import { checkLeg, type Leg, toContract } from "../../ts/src/contract";
import { guard, localClock } from "../../ts/src/guard";
import {
  AB, CITY, heroChat, heroWeb, LABEL, type Outcome, QUOTED, quotedShot, recorded, REPEAT, ROUTES, type Search,
  SEARCHES, shot, VALID,
} from "./data";

const VIEWS = [
  ["finding", "Finding"],
  ["searches", "Searches"],
  ["guard", "Guard"],
  ["canary", "Canary"],
  ["run", "Run it"],
] as const;
type View = (typeof VIEWS)[number][0];

function useView(): [View, (v: View) => void] {
  const read = () => {
    const h = location.hash.slice(1);
    return (VIEWS.some(([k]) => k === h) ? h : "finding") as View;
  };
  const [view, setView] = useState<View>(read);
  useEffect(() => {
    const on = () => setView(read());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return [view, (v) => { location.hash = v; setView(v); window.scrollTo(0, 0); }];
}

const wrong = (s: Search) => s.cls === "shifted" || s.cls === "utc_label";
const count = (cls: Outcome) => VALID.filter((s) => s.cls === cls).length;

function Flap({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <span className="flap" aria-label={text}>
      {text.split("").map((c, i) => (
        <span key={i} className={c === ":" || c === " " ? "sep" : "cell"} style={{ animationDelay: `${delay + i * 40}ms` }} aria-hidden>
          {c}
        </span>
      ))}
    </span>
  );
}

export function App() {
  const [view, go] = useView();
  return (
    <div className="shell">
      <header className="top">
        <a className="brand" href="#finding" onClick={() => go("finding")}>
          <span className="dot" aria-hidden />Flight time check
        </a>
        <nav aria-label="Views">
          {VIEWS.map(([k, label]) => (
            <button key={k} type="button" aria-current={view === k ? "page" : undefined} onClick={() => go(k)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {view === "finding" && <Finding go={go} />}
        {view === "searches" && <Searches />}
        {view === "guard" && <GuardView />}
        {view === "canary" && <Canary />}
        {view === "run" && <RunIt />}
      </main>
      <footer>
        <span>Faris Sadik</span>
        <span>17 November 2026</span>
        <span>An independent test of public pages, with no access to internal systems or data.</span>
      </footer>
    </div>
  );
}

function Finding({ go }: { go: (v: View) => void }) {
  const same = VALID.filter((s) => s.zone === "same");
  const cross = VALID.filter((s) => s.zone === "cross");
  const arm = (k: string) => AB.arms[k].trials;
  const z = [...arm("A"), ...arm("C")];
  const off = [...arm("B"), ...arm("D")];
  const stop = arm("E");
  const walls = REPEAT.runs.filter((r) => r.wall_ms).map((r) => r.wall_ms! / 1000).sort((a, b) => a - b);
  const median = Math.round((walls[(walls.length - 1) >> 1] + walls[walls.length >> 1]) / 2);
  return (
    <>
      <section className="hero">
        <p className="kick">Live test, 17 November 2026. Flight Network app in ChatGPT, checked against se.flightnetwork.com</p>
        <h1>Same flight, same fare, one hour apart.</h1>
        <div className="boards">
          <div className="board bad">
            <div className="bh"><span>ChatGPT, Flight Network app</span><span>Stockholm to Gothenburg</span></div>
            <div className="brow">
              <span className="fn">SK 171</span>
              <Flap text="23:15" delay={200} />
              <span className="arrow">→</span>
              <Flap text="00:15" delay={420} />
              <span className="tag">+1 day</span>
            </div>
          </div>
          <div className="board">
            <div className="bh"><span>se.flightnetwork.com, from that answer</span><span>586 SEK both</span></div>
            <div className="brow">
              <span className="fn">SK 171</span>
              <Flap text="22:15" delay={640} />
              <span className="arrow">→</span>
              <Flap text="23:15" delay={860} />
              <span className="tag quiet">15 Dec</span>
            </div>
          </div>
        </div>
      </section>

      <section className="stats">
        <div><b>{count("shifted")}</b><span>show a different hour than the website</span></div>
        <div><b>{count("utc_label")}</b><span>right digits, presented as UTC</span></div>
        <div><b>{count("rescued")}</b><span>right, the model overrode the UTC marker</span></div>
        <div><b>{count("ok")}</b><span>right, both airports at UTC+0</span></div>
        <p className="of">Of {VALID.length} searches with flights.</p>
      </section>

      <section className="two">
        <div>
          <h2>Only where both airports share a time zone</h2>
          <p>
            The tool hands the model local clock time with a <code>Z</code>, which means UTC. The model checks the times
            against the duration. Across two zones the numbers clash and it trusts the duration. Inside one zone nothing
            clashes, so it believes the label.
          </p>
          <div className="bars">
            <Bar label="Same time zone, not UTC" k={same.filter(wrong).length} n={same.length} hot />
            <Bar label="Different time zones" k={cross.filter(wrong).length} n={cross.length} />
          </div>
          <p className="sm">
            Ten more runs of the Stockholm to Gothenburg search: {REPEAT.runs.filter((r) => r.result === "wrong").length} wrong,
            {" "}{REPEAT.runs.filter((r) => r.result === "right").length} right, median {median} seconds. The one right answer was
            the slowest, because the model looked the schedule up on the web first.
          </p>
        </div>
        <figure className="quote">
          <img src={quotedShot} alt="ChatGPT quoting the tool's dep.time as 2026-12-15T07:10:00Z for a 07:10 local departure from Zurich" />
          <figcaption>The field, as ChatGPT quoted it. The website shows this flight leaving Zurich at 07:10 local time.</figcaption>
        </figure>
      </section>

      <section>
        <h2>The fix, tested on the same model</h2>
        <div className="ab">
          <AbCard title="As returned today, with Z" k={z.filter((t) => t.right).length} n={z.length} code="2026-12-15T07:10:00Z" />
          <AbCard title="With the airport offset" k={off.filter((t) => t.right).length} n={off.length} code="2026-12-15T07:10:00+01:00" good />
          <AbCard title="Stopgap: Z plus one sentence" k={stop.filter((t) => t.right).length} n={stop.length} code="Z, times are local" note="each answer flags the conflict" />
        </div>
        <p className="sm">Three real flights pasted as a tool result into a new chat, Zurich to Rome and London to Stockholm.</p>
        <button type="button" className="cta" onClick={() => go("guard")}>Run the guard on any route</button>
      </section>

      <section className="pair">
        <figure><img src={heroChat} alt="ChatGPT answer listing SK 171 at 23:15" /><figcaption>ChatGPT</figcaption></figure>
        <figure><img src={heroWeb} alt="Website listing the same flight at 22:15" /><figcaption>se.flightnetwork.com</figcaption></figure>
      </section>
    </>
  );
}

function Bar({ label, k, n, hot }: { label: string; k: number; n: number; hot?: boolean }) {
  return (
    <div className="bar">
      <span>{label}</span>
      <i><u className={hot ? "hot" : ""} style={{ width: `${(k / n) * 100}%` }} /></i>
      <b>{k} of {n}</b>
    </div>
  );
}

function AbCard({ title, k, n, code, good, note }: { title: string; k: number; n: number; code: string; good?: boolean; note?: string }) {
  return (
    <div className={`abc ${good ? "good" : ""}`}>
      <small>{title}</small>
      <code>{code}</code>
      <b>{k} of {n}</b>
      <span>right local times{note ? `, ${note}` : ""}</span>
    </div>
  );
}

const FILTERS: [string, string][] = [["all", "All"], ["shifted", "Wrong hour"], ["utc_label", "Shown as UTC"], ["rescued", "Model corrected"], ["ok", "Unaffected"], ["void", "No result"]];

function Searches() {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<number | null>(null);
  const list = SEARCHES.filter((s) => filter === "all" || s.cls === filter);
  return (
    <section>
      <h1 className="h1s">Every search, with both screens.</h1>
      <p className="lede">The website is the expected value. ChatGPT is the output. Open a row for every flight, the model's own note and the two screenshots.</p>
      <div className="chips" role="group" aria-label="Filter">
        {FILTERS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l} <span>{k === "all" ? SEARCHES.length : SEARCHES.filter((s) => s.cls === k).length}</span>
          </button>
        ))}
      </div>
      <div className="list">
        <div className="lh"><span>#</span><span>Route</span><span>Website</span><span>ChatGPT</span><span>Result</span></div>
        {list.map((s) => {
          const r = s.rows?.find((x) => x.web);
          return (
            <div key={s.n} className={`item ${open === s.n ? "open" : ""}`}>
              <button type="button" className="li" onClick={() => setOpen(open === s.n ? null : s.n)} aria-expanded={open === s.n}>
                <span className="mono">{String(s.n).padStart(2, "0")}</span>
                <span>{s.frm} → {s.to}<small>{CITY[s.frm]} to {CITY[s.to]}</small></span>
                <span className="mono">{r?.web ? `${r.web[0]} → ${r.web[1]}` : "none"}</span>
                <span className={`mono ${r && (r.sd || r.sa) ? "hotx" : ""}`}>{r ? `${r.dep} → ${r.arr}` : "none"}</span>
                <span><em className={`pill p-${s.cls}`}>{LABEL[s.cls]}</em></span>
              </button>
              {open === s.n && <Detail s={s} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Detail({ s }: { s: Search }) {
  const chat = shot(s.n, "chat");
  const web = shot(s.n, "web");
  return (
    <div className="detail">
      <p className="sm">
        {s.frm} is at UTC{s.off_from >= 0 ? "+" : ""}{s.off_from}, {s.to} at UTC{s.off_to >= 0 ? "+" : ""}{s.off_to} on 15 December 2026.
        {s.listed ? ` ${s.matched} of ${s.listed} listed flights matched to a website row with the same duration.` : ""}
      </p>
      {s.rows && (
        <div className="tw">
          <table>
            <thead><tr><th>Flight</th><th>ChatGPT</th><th>Website</th><th>Difference</th><th>Fare, chat / web</th></tr></thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.fn}</td>
                  <td className="mono">{r.dep} → {r.arr}</td>
                  <td className="mono">{r.web ? `${r.web[0]} → ${r.web[1]}` : "not on page one"}</td>
                  <td className={r.sd || r.sa ? "hotx mono" : "mono"}>{r.web ? (r.sd || r.sa ? `${(r.sd ?? 0) / 60 > 0 ? "+" : ""}${(r.sd ?? 0) / 60} h` : "same") : ""}</td>
                  <td className="mono">{r.fare}{r.web ? ` / ${r.web[3]}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.note && <blockquote>{s.note.replace("VOID: ", "")}<cite>ChatGPT, in the same answer</cite></blockquote>}
      <div className="pair">
        {chat && <figure><img loading="lazy" src={chat} alt={`ChatGPT answer for search ${s.n}`} /><figcaption>ChatGPT</figcaption></figure>}
        {web && <figure><img loading="lazy" src={web} alt={`Website result page for search ${s.n}`} /><figcaption>se.flightnetwork.com</figcaption></figure>}
      </div>
    </div>
  );
}

function GuardView() {
  const [route, setRoute] = useState("ARN-GOT");
  const [o, d] = route.split("-");
  const raw = useMemo(() => recorded(o, d), [o, d]);
  const out = useMemo(() => guard(raw), [raw]);
  const [text, setText] = useState(JSON.stringify(QUOTED[0], null, 1));
  const [result, setResult] = useState<{ kind: string; body: string; ok: boolean } | null>(null);

  const run = (kind: "check" | "fix" | "guard") => {
    let legs: Leg[];
    try {
      const v = JSON.parse(text);
      legs = Array.isArray(v) ? v : [v];
    } catch (e) {
      setResult({ kind: "error", body: `Not valid JSON: ${(e as Error).message}`, ok: false });
      return;
    }
    try {
      if (kind === "check") {
        const lines = legs.map((l, i) => {
          const e = checkLeg(l);
          return `leg ${i + 1} ${l.dep?.iata}-${l.arr?.iata}: ${e.length ? "FAIL" : "ok"}${e.map((x) => `\n    ${x}`).join("")}`;
        });
        const failing = legs.filter((l) => checkLeg(l).length).length;
        setResult({ kind, body: `${lines.join("\n")}\n${failing} of ${legs.length} legs break the contract`, ok: failing === 0 });
      } else if (kind === "fix") {
        const fixed = legs.map(toContract);
        setText(JSON.stringify(fixed.length === 1 ? fixed[0] : fixed, null, 1));
        setResult({ kind, body: "Rewritten with the airport offset. Press Check to confirm.", ok: true });
      } else {
        const g = guard(legs);
        setResult({ kind, body: JSON.stringify(g, null, 1), ok: g.held.length === 0 });
      }
    } catch (e) {
      setResult({ kind: "error", body: (e as Error).message, ok: false });
    }
  };

  return (
    <section>
      <h1 className="h1s">The guard, in front of the tool.</h1>
      <p className="lede">
        Attach the airport's UTC offset to every time, check in code that arrival minus departure equals the duration, and hold
        any flight that still fails. The same code runs in Python, TypeScript and Go in the repository; this page runs the TypeScript one.
      </p>
      <div className="pick">
        <label htmlFor="route">Route, 15 December 2026</label>
        <select id="route" value={route} onChange={(e) => setRoute(e.target.value)}>
          {ROUTES.map(([a, b]) => <option key={`${a}-${b}`} value={`${a}-${b}`}>{a} to {b}, {CITY[a]} to {CITY[b]}</option>)}
        </select>
        <span className="sm">{raw.length} flights, {raw.filter((f) => checkLeg(f).length).length} break a rule as returned today, {out.held.length} held by the guard</span>
      </div>
      <div className="tw">
        <table className="gt">
          <thead><tr><th>The tool returns today</th><th>Rules broken</th><th>The guard hands the model</th><th>The traveller sees</th></tr></thead>
          <tbody>
            {raw.map((f, i) => {
              const g = out.flights[i];
              return (
                <tr key={i}>
                  <td className="mono">{f.dep.time.slice(11)}</td>
                  <td className={`mono ${checkLeg(f).length ? "hotx" : ""}`}>{checkLeg(f).length}</td>
                  <td className="mono">{g ? g.dep.time.slice(11) : "held"}</td>
                  <td className="mono strong">{g ? `${localClock(g.dep.time)} → ${localClock(g.arr.time)}` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Check any response</h2>
      <p className="sm">One leg or a list. Prefilled with a field ChatGPT quoted from the tool.</p>
      <div className="console">
        <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Flight legs as JSON" />
        <div className="ctl">
          <button type="button" onClick={() => run("check")}>Check</button>
          <button type="button" onClick={() => run("fix")}>Fix</button>
          <button type="button" onClick={() => run("guard")}>Guard</button>
          <button type="button" className="ghost" onClick={() => { setText(JSON.stringify(QUOTED, null, 1)); setResult(null); }}>All 17 quoted</button>
        </div>
        {result && <pre className={`out ${result.ok ? "okx" : "bad"}`}>{result.body}</pre>}
      </div>
    </section>
  );
}

function Canary() {
  const [rows, setRows] = useState<{ route: string; flights: number; raw: number; shown: number; shownBad: number; held: number }[] | null>(null);
  const [shown, setShown] = useState(0);
  const run = () => {
    const r = ROUTES.map(([a, b]) => {
      const raw = recorded(a, b);
      const g = guard(raw);
      return { route: `${a}-${b}`, flights: raw.length, raw: raw.filter((f) => checkLeg(f).length).length, shown: g.flights.length, shownBad: g.flights.filter((f) => checkLeg(f).length).length, held: g.held.length };
    });
    setRows(r);
    setShown(0);
  };
  useEffect(() => {
    if (!rows || shown >= rows.length) return;
    const t = setTimeout(() => setShown((s) => s + 1), 45);
    return () => clearTimeout(t);
  }, [rows, shown]);
  const done = rows && shown >= rows.length;
  return (
    <section>
      <h1 className="h1s">The canary: two rules, every route, no model.</h1>
      <p className="lede">What would run every day against the real tool. Here it runs against the recording, before and after the guard.</p>
      <button type="button" className="cta" onClick={run}>{rows ? "Run again" : "Run the canary"}</button>
      {rows && (
        <>
          <div className="stats three">
            <div><b>{done ? rows.filter((r) => r.raw).length : "…"}<s> of {rows.length}</s></b><span>routes where the tool breaks a rule today</span></div>
            <div><b>{done ? rows.filter((r) => r.shownBad).length : "…"}<s> of {rows.length}</s></b><span>routes where the guard shows a rule-breaker</span></div>
            <div><b>{done ? rows.reduce((a, r) => a + r.held, 0) : "…"}<s> of {rows.reduce((a, r) => a + r.flights, 0)}</s></b><span>flights held by the guard</span></div>
          </div>
          <div className="tw">
            <table>
              <thead><tr><th>Route</th><th>Flights</th><th>Break a rule today</th><th>Shown through the guard</th><th>Break a rule</th><th>Held</th></tr></thead>
              <tbody>
                {rows.slice(0, shown).map((r) => (
                  <tr key={r.route} className="in">
                    <td className="mono">{r.route}</td><td className="mono">{r.flights}</td>
                    <td className={`mono ${r.raw ? "hotx" : ""}`}>{r.raw}</td><td className="mono">{r.shown}</td>
                    <td className="mono">{r.shownBad}</td><td className="mono">{r.held}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {done && <p className="sm">The routes that pass today: {rows.filter((r) => !r.raw).map((r) => r.route).join(" and ")}. Both airports are at UTC+0, where Z happens to be true.</p>}
        </>
      )}
    </section>
  );
}

const RUN: [string, string, string][] = [
  ["Python", "Analysis, the guard and the MCP server", "pip install pytest mcp\npython3 -m pytest -q\npython3 stats.py\npython3 canary.py\npython3 server.py"],
  ["TypeScript", "The guard for a Node stack, an MCP server, this program", "cd ts && npm ci && npm test && npm start\ncd app && npm ci && npm run dev"],
  ["Go", "ftcheck, one static binary for CI and ops", "cd go && go test ./...\ngo build -o bin/ftcheck ./ftcheck\n./bin/ftcheck ../examples/quoted_all.json"],
  ["SQL", "The test as tables, and the queries BI would run", "python3 sql/run.py\npython3 sql/run.py ftc.sqlite"],
  ["Make and Docker", "Everything at once", "make test\ndocker build -t flight-time-check .\ndocker run --rm flight-time-check"],
];

function RunIt() {
  return (
    <section>
      <h1 className="h1s">Run it.</h1>
      <p className="lede">One contract, one airport table, four languages. Every one of them is tested against the same recorded data in CI.</p>
      <div className="runs">
        {RUN.map(([lang, what, cmd]) => (
          <div key={lang} className="run">
            <h3>{lang}</h3>
            <p className="sm">{what}</p>
            <pre>{cmd}</pre>
          </div>
        ))}
      </div>
      <h2>What this test can and cannot carry</h2>
      <ul className="lim">
        <li>One day, one account, one model setting, one market, one travel date.</li>
        <li>Searches 1 to 22 were planned in advance: 7 of 20 valid ones were wrong. 23 to 27 were chosen afterwards to test the same-zone explanation: 5 of 5 wrong.</li>
        <li>I have not seen the tool's response directly, only ChatGPT's quote of it in ten conversations, 17 flights.</li>
        <li>The guard, the canary and both servers run against a recording, not the real tool. I have no MCP access.</li>
        <li>Nobody was booked on a wrong flight. The booking page shows the right time in every case.</li>
      </ul>
    </section>
  );
}
