import { useEffect, useMemo, useState } from "react";
import { checkLeg, type Leg, toContract } from "../../ts/src/contract";
import { guard, localClock } from "../../ts/src/guard";
import {
  AB, abShot, CITY, heroChat, heroWeb, LABEL, type Outcome, QUOTED, quotedShot, recorded, REPEAT, ROUTES,
  type Search, SEARCHES, shot, VALID,
} from "./data";

const VIEWS = [
  ["finding", "Finding"],
  ["searches", "The searches"],
  ["guard", "Guard"],
  ["canary", "Canary"],
  ["run", "Run it"],
] as const;
type View = (typeof VIEWS)[number][0];

const DESC: Record<Outcome, string> = {
  shifted: "the chat calls it local time",
  utc_label: "a reader who converts ends up wrong",
  rescued: "it says so in the answer",
  ok: "both airports at UTC+0",
  void: "no nonstop flights",
};
const isWrong = (s: Search) => s.cls === "shifted" || s.cls === "utc_label";

function readView(): View {
  const h = location.hash.slice(1);
  return (VIEWS.some(([k]) => k === h) ? h : "finding") as View;
}

const Chev = () => (
  <svg className="chev" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
    <path d="m3.5 5.5 3.5 3.5 3.5-3.5" />
  </svg>
);

export function App() {
  const [view, setView] = useState<View>(readView);
  const [open, setOpen] = useState<number | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  useEffect(() => {
    const on = () => setView(readView());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, []);
  const go = (v: View) => { location.hash = v; setView(v); scrollTo(0, 0); };
  const openSearch = (n: number) => { setOpen(n); go("searches"); };

  return (
    <div className="win">
      <header className="bar">
        <b>Flight time check</b>
        <nav className="tabs" role="tablist">
          {VIEWS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => go(k)}>{label}</button>
          ))}
        </nav>
        <span className="ex">Program by Faris Sadik · recorded 17 November 2026 · independent test of public pages</span>
      </header>
      {view === "finding" && <Finding openSearch={openSearch} zoom={setZoom} />}
      {view === "searches" && <Searches open={open} setOpen={setOpen} zoom={setZoom} />}
      {view === "guard" && <GuardView />}
      {view === "canary" && <Canary />}
      {view === "run" && <RunIt />}
      <div className="foot">Faris Sadik · 17 November 2026 · screenshots are evidence of public pages, taken in my own browser · the guard runs against a recording of the tool</div>
      {zoom && <div id="lb" onClick={() => setZoom(null)} role="dialog" aria-label="Enlarged screenshot, click to close"><img src={zoom} alt="" /></div>}
    </div>
  );
}

function Finding({ openSearch, zoom }: { openSearch: (n: number) => void; zoom: (s: string) => void }) {
  const same = VALID.filter((s) => s.zone === "same");
  const cross = VALID.filter((s) => s.zone === "cross");
  const planned = VALID.filter((s) => s.n <= 22);
  const runs = REPEAT.runs;
  const walls = runs.filter((r) => r.wall_ms).map((r) => r.wall_ms! / 1000).sort((a, b) => a - b);
  const median = Math.round((walls[(walls.length - 1) >> 1] + walls[walls.length >> 1]) / 2);
  const [s, setS] = useState<"accepted" | "rejected">("rejected");
  const right = (keys: string[]) => {
    const t = keys.flatMap((k) => AB.arms[k].trials);
    return [t.filter((x) => x.right).length, t.length];
  };
  const [zk, zn] = right(["A", "C"]);
  const [ok, on] = right(["B", "D"]);
  const [ek, en] = right(["E"]);
  const meter = (rows: Search[]) => (
    <div className="meter">{rows.map((r) => <i key={r.n} title={`Search ${r.n}: ${LABEL[r.cls]}`} className={r.cls === "shifted" ? "x" : r.cls === "utc_label" ? "u" : ""} />)}</div>
  );

  return (
    <section className="view">
      <div>
        <p className="kick">Live test, 17 November 2026. Flight Network app in ChatGPT, checked against se.flightnetwork.com.</p>
        <h1>Same flight, same fare, one hour apart.</h1>
        <p className="lede">
          I ran <b className="n">{VALID.length}</b> flight searches in the Flight Network app inside ChatGPT and opened the link each answer gives to
          the website. In <b className="n">{VALID.filter((x) => x.cls === "shifted").length}</b> the chat shows a different hour than the website. In{" "}
          <b className="n">{VALID.filter((x) => x.cls === "utc_label").length}</b> more the digits match, but the chat presents them as UTC.
        </p>
      </div>

      <div>
        <div className="pair">
          <figure className="shot"><figcaption>ChatGPT, Flight Network app <span>Stockholm to Gothenburg</span></figcaption>
            <img src={heroChat} alt="ChatGPT answer listing SK 171 departing 23:15" onClick={() => zoom(heroChat)} /></figure>
          <div className="gap">+1 h<small>and the next date</small></div>
          <figure className="shot"><figcaption>se.flightnetwork.com <span>opened from that answer</span></figcaption>
            <img src={heroWeb} alt="Website showing the same flight departing 22:15" onClick={() => zoom(heroWeb)} /></figure>
        </div>
        <div className="say" style={{ marginTop: 12 }}>
          <div className="w"><small>ChatGPT tells the traveller, SK 171, 586 SEK</small><b>23:15 → 00:15, 16 Dec</b></div>
          <div><small>The website, same flight, same fare</small><b>22:15 → 23:15, 15 Dec</b></div>
        </div>
      </div>

      <div>
        <h2>What the {VALID.length} searches showed</h2>
        <div className="grp">
          {(["shifted", "utc_label", "rescued", "ok"] as Outcome[]).map((cls) => {
            const rows = VALID.filter((x) => x.cls === cls);
            return (
              <div key={cls} className={`c-${cls}`}>
                <b>{rows.length}</b>
                <span>{LABEL[cls]}</span>
                <small>{DESC[cls]}</small>
                <div className="strip">{rows.map((r) => <button key={r.n} type="button" onClick={() => openSearch(r.n)} title={`${CITY[r.frm]} to ${CITY[r.to]}`}>{r.frm}-{r.to}</button>)}</div>
                <div className="bar2"><i style={{ width: `${(rows.length / VALID.length) * 100}%` }} /></div>
              </div>
            );
          })}
        </div>
        <p className="sm" style={{ marginTop: 12 }}>
          Each code is one search; select it to see both screens. {planned.filter(isWrong).length} of the {planned.length} searches planned in advance had one of the two faults.
        </p>
      </div>

      <div className="vs">
        <div><h3>Same time zone, not UTC <b>{same.filter(isWrong).length} of {same.length} faulty</b></h3>{meter(same)}
          <p className="sm">Stockholm to Gothenburg: one hour either way. Nothing clashes against the duration, so the model believes the UTC label.</p></div>
        <div><h3>Different time zones <b>{cross.filter(isWrong).length} of {cross.length} faulty</b></h3>{meter(cross)}
          <p className="sm">London to Stockholm: read as UTC, a 2 h 25 flight would take 3 h 25. The model sees the clash and trusts the duration.</p></div>
      </div>

      <div className="two">
        <div>
          <h2>The same search, ten more times</h2>
          <div className="rep">
            {runs.map((r) => (
              <i key={r.run} className={r.result === "right" ? "r" : r.result === "error" ? "e" : ""}>
                {r.result === "wrong" ? "23:15" : r.result === "right" ? "22:15" : "error"}
                <small>{r.wall_ms ? `${Math.round(r.wall_ms / 1000)} s` : "no answer"}</small>
              </i>
            ))}
          </div>
          <p className="sm">
            <b className="n">{runs.filter((r) => r.result === "wrong").length} of {runs.length}</b> showed 23:15 for the 22:15 flight. Median {median} seconds.
            The one right answer was the slowest: the model looked the schedule up on the web before it trusted the tool.
          </p>
        </div>
        <figure className="shot"><figcaption>The field, as ChatGPT quoted it <span>select to enlarge</span></figcaption>
          <img src={quotedShot} alt="ChatGPT quoting dep.time 2026-12-15T07:10:00Z" onClick={() => zoom(quotedShot)} /></figure>
      </div>

      <div>
        <h2>The fix, tested on the same model</h2>
        <p style={{ marginBottom: 14 }}>Send the same digits with the airport's own offset. Accept or reject the change to see what ChatGPT showed the traveller.</p>
        <div className="card diff" data-s={s}>
          <div className="hd">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M3 8h10M8 3v10" /></svg>
            Suggested change to one field
          </div>
          <div className="bd">"time": "2026-12-15T07:10:00<del>Z</del><ins>+01:00</ins>"</div>
          <div className="out">
            <span>ChatGPT showed</span>
            <b>{s === "accepted" ? "07:10 → 08:40" : "08:10 → 09:40"}</b>
            <span>{s === "accepted" ? `right, ${ok} of ${on} trials` : `the website says 07:10. ${zk} of ${zn} trials right`}</span>
          </div>
          <div className="ft">
            <span><b>1</b>suggestion · stopgap with Z plus one sentence: {ek} of {en} right, each answer flags the conflict</span>
            <button type="button" className="btn" onClick={() => setS("rejected")}>Reject <kbd>N</kbd></button>
            <button type="button" className="btn pri" onClick={() => setS("accepted")}>Accept <kbd>Y</kbd></button>
          </div>
        </div>
        <div className="ab" style={{ marginTop: 12 }}>
          {["A", "B", "C", "D"].map((k) => abShot(k).slice(0, 2).map((src, i) => (
            <img key={`${k}${i}`} src={src} alt={`A/B trial ${k}${i + 1}`} onClick={() => zoom(src)} />
          )))}
        </div>
      </div>
    </section>
  );
}

function Searches({ open, setOpen, zoom }: { open: number | null; setOpen: (n: number | null) => void; zoom: (s: string) => void }) {
  const [filter, setFilter] = useState<Outcome | "all">("all");
  useEffect(() => {
    if (open) document.getElementById(`case-${open}`)?.scrollIntoView({ block: "start" });
  }, []);
  const list = SEARCHES.filter((s) => filter === "all" || s.cls === filter);
  const filters: (Outcome | "all")[] = ["all", "shifted", "utc_label", "rescued", "ok", "void"];
  return (
    <section className="view">
      <div>
        <h2 className="big">Every search, with both screens.</h2>
        <p className="lede">The website is the expected value, ChatGPT is the output. Open a row for every flight, the model's own note and the two captures.</p>
      </div>
      <div>
        <div className="seg" role="group" aria-label="Filter" style={{ marginBottom: 14 }}>
          {filters.map((k) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {k === "all" ? "All" : LABEL[k]}<i>{k === "all" ? SEARCHES.length : SEARCHES.filter((s) => s.cls === k).length}</i>
            </button>
          ))}
        </div>
        <div className="cases">
          <div className="th"><span>#</span><span>Route</span><span>Website, first flight</span><span>ChatGPT showed</span><span>Result</span><span /></div>
          {list.map((s) => {
            const r = s.rows?.find((x) => x.web);
            const bad = !!r && !!(r.sd || r.sa);
            return (
              <div key={s.n} id={`case-${s.n}`} className={`case c-${s.cls}`} data-open={open === s.n ? "" : undefined}>
                <button type="button" aria-expanded={open === s.n} onClick={() => setOpen(open === s.n ? null : s.n)}>
                  <i>{String(s.n).padStart(2, "0")}</i>
                  <b>{s.frm} → {s.to}<small>{CITY[s.frm]} to {CITY[s.to]}</small></b>
                  <span className="t">{r?.web ? `${r.web[0]} → ${r.web[1].replace("+1", "")}` : "none"}</span>
                  <span className={`t ${bad ? "x" : ""}`}>{r ? `${r.dep} → ${r.arr.replace("+1", "")}` : "none"}{s.cls === "utc_label" && <small>as UTC</small>}</span>
                  <span><em className="pill" style={{ fontStyle: "normal" }}>{LABEL[s.cls]}</em></span>
                  <Chev />
                </button>
                {open === s.n && <Detail s={s} zoom={zoom} />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Detail({ s, zoom }: { s: Search; zoom: (src: string) => void }) {
  const chat = shot(s.n, "chat");
  const web = shot(s.n, "web");
  const off = (h: number) => `UTC${h >= 0 ? "+" : ""}${h}`;
  const diff = (r: NonNullable<Search["rows"]>[number]) => (r.web ? (r.sd || r.sa ? `${(r.sd ?? 0) > 0 ? "+" : ""}${(r.sd ?? 0) / 60} h` : "same") : "");
  return (
    <div className="det">
      <p className="sm">Search {s.n} of 27. {s.frm} is at {off(s.off_from)}, {s.to} at {off(s.off_to)} on 15 December 2026.{s.listed ? ` ${s.matched} of ${s.listed} listed flights matched to a website row with the same duration.` : ""}</p>
      {s.rows && (
        <>
          <div className="box">
            <table className="tbl">
              <thead><tr><th>Flight</th><th>ChatGPT departs</th><th>arrives</th><th>Website departs</th><th>arrives</th><th>Difference</th><th>Fare, chat / website</th></tr></thead>
              <tbody>
                {s.rows.map((r, i) => {
                  const bad = !!(r.sd || r.sa);
                  return (
                    <tr key={i}>
                      <td className="m">{r.fn}</td>
                      <td className={`m ${bad ? "x" : ""}`}>{r.dep}</td><td className={`m ${bad ? "x" : ""}`}>{r.arr.replace("+1", " +1")}</td>
                      {r.web ? <><td className="m">{r.web[0]}</td><td className="m">{r.web[1].replace("+1", " +1")}</td><td className={`m ${bad ? "x" : ""}`}>{diff(r)}</td></>
                        : <td colSpan={3} className="sm">not on the first website page, unchecked</td>}
                      <td className="m">{r.fare}{r.web ? ` / ${r.web[3]}` : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="mrows">
            {s.rows.map((r, i) => {
              const bad = !!(r.sd || r.sa);
              return (
                <li key={i}>{r.fn}<span>{r.fare}</span>
                  <div><small>ChatGPT</small><span className={bad ? "x" : ""}>{r.dep} → {r.arr}</span></div>
                  <div><small>Website</small><span>{r.web ? `${r.web[0]} → ${r.web[1]}` : "not on first page"}</span></div>
                  <em className={bad ? "x" : ""}>{bad ? diff(r) : "same times"}</em>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {s.note && <blockquote>{s.note.replace("VOID: ", "")}<small>ChatGPT, in the same answer</small></blockquote>}
      <div className="shots">
        {chat && <figure className="shot"><figcaption>ChatGPT <span>select to enlarge</span></figcaption><img loading="lazy" src={chat} alt={`ChatGPT answer for search ${s.n}`} onClick={() => zoom(chat)} /></figure>}
        {web && <figure className="shot"><figcaption>se.flightnetwork.com <span>select to enlarge</span></figcaption><img loading="lazy" src={web} alt={`Website for search ${s.n}`} onClick={() => zoom(web)} /></figure>}
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
  const [res, setRes] = useState<{ body: string; ok: boolean } | null>(null);

  const run = (kind: "check" | "fix" | "guard") => {
    let legs: Leg[];
    try {
      const v = JSON.parse(text);
      legs = Array.isArray(v) ? v : [v];
    } catch (e) {
      setRes({ body: `Not valid JSON: ${(e as Error).message}`, ok: false });
      return;
    }
    try {
      if (kind === "check") {
        const failing = legs.filter((l) => checkLeg(l).length).length;
        const lines = legs.map((l, i) => {
          const e = checkLeg(l);
          return `leg ${i + 1} ${l.dep?.iata}-${l.arr?.iata}: ${e.length ? "FAIL" : "ok"}${e.map((x) => `\n    ${x}`).join("")}`;
        });
        setRes({ body: `${lines.join("\n")}\n${failing} of ${legs.length} legs break the contract`, ok: failing === 0 });
      } else if (kind === "fix") {
        const fixed = legs.map(toContract);
        setText(JSON.stringify(fixed.length === 1 ? fixed[0] : fixed, null, 1));
        setRes({ body: "Rewritten with the airport offset. Press Check to confirm.", ok: true });
      } else {
        const g = guard(legs);
        setRes({ body: `${g.flights.length} shown, ${g.held.length} held\n\n${JSON.stringify(g, null, 1)}`, ok: g.held.length === 0 });
      }
    } catch (e) {
      setRes({ body: (e as Error).message, ok: false });
    }
  };
  const broken = raw.filter((f) => checkLeg(f).length).length;

  return (
    <section className="view">
      <div>
        <h2 className="big">The guard, in front of the tool.</h2>
        <p className="lede">It attaches the airport's UTC offset to every time, checks in code that arrival minus departure equals the duration, and holds any flight that still fails. The same guard is in Python, TypeScript and Go; this page runs the TypeScript one.</p>
      </div>

      <div className="flow">
        <div><b>Flight tool</b>local digits with Z</div><span>→</span>
        <div className="hit"><b>Guard</b>offset attached, duration checked</div><span>→</span>
        <div><b>Model in ChatGPT</b>reads a true time</div><span>→</span>
        <div><b>Traveller</b>sees the website's time</div>
      </div>

      <div>
        <div className="est" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr)", marginBottom: 14 }}>
          <label>Route, 15 December 2026
            <select className="sel" value={route} onChange={(e) => setRoute(e.target.value)}>
              {ROUTES.map(([a, b]) => <option key={`${a}-${b}`} value={`${a}-${b}`}>{a}-{b}, {CITY[a]} to {CITY[b]}</option>)}
            </select>
          </label>
          <div className="say">
            <div className={broken ? "w" : ""}><small>Break a rule as returned today</small><b>{broken} of {raw.length}</b></div>
            <div><small>Held by the guard</small><b>{out.held.length} of {raw.length}</b></div>
          </div>
        </div>
        <div className="box">
          <table className="tbl">
            <thead><tr><th>The tool returns today</th><th>Rules broken</th><th>The guard hands the model</th><th>The traveller sees</th><th>Fare</th></tr></thead>
            <tbody>
              {raw.map((f, i) => {
                const g = out.flights[i];
                const n = checkLeg(f).length;
                return (
                  <tr key={i}>
                    <td className="m">{f.dep.time.slice(11)}</td>
                    <td className={`m ${n ? "x" : ""}`}>{n}</td>
                    <td className="m" style={{ color: "var(--ok)" }}>{g ? g.dep.time.slice(11) : "held"}</td>
                    <td className="m"><b>{g ? `${localClock(g.dep.time)} → ${localClock(g.arr.time)}` : ""}</b></td>
                    <td className="m">{f.fare}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="two">
        <div>
          <h2>Check any response</h2>
          <p className="sm" style={{ marginBottom: 12 }}>One leg or a list. Prefilled with a flight ChatGPT quoted from the tool.</p>
          <details className="card tool" open>
            <summary>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M4 4h8v8H4z" /></svg>
              <code>tool response</code><span>JSON</span>
            </summary>
            <div className="in">
              <textarea className="code" rows={12} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Flight legs as JSON" />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn pri" onClick={() => run("check")}>Check</button>
                <button type="button" className="btn" onClick={() => run("fix")}>Fix</button>
                <button type="button" className="btn" onClick={() => run("guard")}>Guard</button>
                <button type="button" className="btn" onClick={() => { setText(JSON.stringify(QUOTED, null, 1)); setRes(null); }}>All 17 quoted</button>
              </div>
            </div>
          </details>
        </div>
        <div>
          <h2>Result</h2>
          <p className="sm" style={{ marginBottom: 12 }}>The two rules: the airport's offset on every time, and arrival minus departure equals durationMinutes.</p>
          <div className={`res ${res ? (res.ok ? "rok" : "rbad") : ""}`}>{res ? res.body : "Press Check, Fix or Guard."}</div>
        </div>
      </div>
    </section>
  );
}

function Canary() {
  const [rows, setRows] = useState<{ route: string; flights: number; raw: number; shown: number; bad: number; held: number }[] | null>(null);
  const [n, setN] = useState(0);
  const run = () => {
    setRows(ROUTES.map(([a, b]) => {
      const raw = recorded(a, b);
      const g = guard(raw);
      return { route: `${a}-${b}`, flights: raw.length, raw: raw.filter((f) => checkLeg(f).length).length, shown: g.flights.length, bad: g.flights.filter((f) => checkLeg(f).length).length, held: g.held.length };
    }));
    setN(0);
  };
  useEffect(() => {
    if (!rows || n >= rows.length) return;
    const t = setTimeout(() => setN((x) => x + 1), 40);
    return () => clearTimeout(t);
  }, [rows, n]);
  const done = !!rows && n >= rows.length;
  const total = rows?.reduce((a, r) => a + r.flights, 0) ?? 0;

  return (
    <section className="view">
      <div>
        <h2 className="big">The canary: two rules, every route, no model.</h2>
        <p className="lede">What would run every day against the real tool. Here it runs against the recording, before and after the guard. It exits with an error if anything that would be shown breaks a rule.</p>
        <button type="button" className="btn pri" style={{ marginTop: 16 }} onClick={run}>{rows ? "Run again" : "Run the canary"}</button>
      </div>
      {rows && (
        <>
          <div className="grp">
            <div className="c-shifted"><b data-of={rows.length}>{done ? rows.filter((r) => r.raw).length : "…"}</b><span>routes break a rule today</span><small>as the tool answers</small><div className="bar2"><i style={{ width: done ? `${(rows.filter((r) => r.raw).length / rows.length) * 100}%` : 0 }} /></div></div>
            <div className="c-rescued"><b data-of={rows.length}>{done ? rows.filter((r) => r.bad).length : "…"}</b><span>routes break a rule through the guard</span><small>what the model would read</small><div className="bar2"><i style={{ width: 0 }} /></div></div>
            <div className="c-ok"><b data-of={total}>{done ? rows.reduce((a, r) => a + r.held, 0) : "…"}</b><span>flights held</span><small>none needed holding</small><div className="bar2"><i style={{ width: 0 }} /></div></div>
            <div className="c-ok"><b data-of={total}>{done ? total : "…"}</b><span>flights checked</span><small>{rows.length} routes</small><div className="bar2"><i style={{ width: "100%" }} /></div></div>
          </div>
          <div className="box">
            <table className="tbl">
              <thead><tr><th>Route</th><th>Flights</th><th>Break a rule today</th><th>Shown through the guard</th><th>Break a rule</th><th>Held</th></tr></thead>
              <tbody>
                {rows.slice(0, n).map((r) => (
                  <tr key={r.route}>
                    <td className="m">{r.route}</td><td className="m">{r.flights}</td>
                    <td className={`m ${r.raw ? "x" : ""}`}>{r.raw}</td><td className="m">{r.shown}</td>
                    <td className="m">{r.bad}</td><td className="m">{r.held}</td>
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
  ["Python", "Analysis, the guard and an MCP server", "pip install pytest mcp\npython3 -m pytest -q\npython3 stats.py\npython3 canary.py\npython3 server.py"],
  ["TypeScript", "The guard for a Node stack, an MCP server, and this program", "cd ts && npm ci && npm test && npm start\ncd app && npm ci && npm run dev"],
  ["Go", "ftcheck, one static binary for CI and ops", "cd go && go test ./...\ngo build -o bin/ftcheck ./ftcheck\n./bin/ftcheck ../examples/quoted_all.json"],
  ["SQL", "The test as tables, and the queries BI would run", "python3 sql/run.py\npython3 sql/run.py ftc.sqlite"],
];

function RunIt() {
  return (
    <section className="view">
      <div>
        <h2 className="big">One contract, four languages.</h2>
        <p className="lede">The same two rules and the same airport table, each version tested against the same recorded data in CI. <code className="m">make test</code> runs all of them.</p>
      </div>
      <div className="vs">
        {RUN.map(([lang, what, cmd]) => (
          <div key={lang}>
            <h3>{lang}</h3>
            <p className="sm" style={{ marginBottom: 10 }}>{what}</p>
            <div className="code">{cmd}</div>
          </div>
        ))}
      </div>
      <div>
        <h2>What this test can and cannot carry</h2>
        <ul className="lim">
          <li>One day, one account, one model setting, one market, one travel date.</li>
          <li>Searches 1 to 22 were planned in advance: 7 of 20 valid ones were wrong. 23 to 27 were chosen afterwards to test the same-zone explanation: 5 of 5 wrong.</li>
          <li>I have not seen the tool's response directly, only ChatGPT's quote of it in ten conversations, 17 flights.</li>
          <li>The guard, the canary and both servers run against a recording, not the real tool. I have no MCP access.</li>
          <li>Nobody was booked on a wrong flight. The booking page shows the right time in every case.</li>
        </ul>
      </div>
    </section>
  );
}
