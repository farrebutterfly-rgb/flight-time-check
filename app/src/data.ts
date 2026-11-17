import ab from "../../data/ab.json";
import repeat from "../../data/repeat.json";
import results from "../../data/results.json";
import quoted from "../../examples/quoted_all.json";
import type { Leg } from "../../ts/src/contract";
import logRaw from "../../data/log.jsonl?raw";

export type Outcome = "shifted" | "utc_label" | "rescued" | "ok" | "void";

export interface Row {
  fn: string;
  dep: string;
  arr: string;
  dur: string;
  fare: string;
  web: [string, string, string, string] | null;
  sd: number | null;
  sa: number | null;
}

export interface Search {
  n: number;
  frm: string;
  to: string;
  off_from: number;
  off_to: number;
  note: string;
  cls: Outcome;
  zone?: "same" | "cross" | "utc0";
  rows?: Row[];
  matched?: number;
  listed?: number;
}

export const SEARCHES = results as unknown as Search[];
export const VALID = SEARCHES.filter((s) => s.cls !== "void");
export const QUOTED = quoted as unknown as Leg[];
export const AB = ab as unknown as { arms: Record<string, { label: string; route: string; trials: { right: boolean; shown: string[] }[] }> };
export const REPEAT = repeat as unknown as { runs: { run: number; wall_ms: number | null; result: string }[] };

export const CITY: Record<string, string> = {
  ARN: "Stockholm", GOT: "Gothenburg", CPH: "Copenhagen", OSL: "Oslo", HEL: "Helsinki", LHR: "London Heathrow",
  LGW: "London Gatwick", EDI: "Edinburgh", LIS: "Lisbon", CDG: "Paris", MAD: "Madrid", BCN: "Barcelona",
  AMS: "Amsterdam", FRA: "Frankfurt", MUC: "Munich", VIE: "Vienna", ZRH: "Zurich", FCO: "Rome", ATH: "Athens",
  IST: "Istanbul", JFK: "New York", LAX: "Los Angeles", DXB: "Dubai", DEL: "Delhi", SIN: "Singapore",
  BKK: "Bangkok", NRT: "Tokyo", ICN: "Seoul", SYD: "Sydney", MEL: "Melbourne",
};

export const LABEL: Record<Outcome, string> = {
  shifted: "Wrong hour",
  utc_label: "Shown as UTC",
  rescued: "Model corrected",
  ok: "Unaffected",
  void: "No result",
};

interface LogRow {
  from: string;
  to: string;
  web: [string, string, string, string][];
}

const LOG: LogRow[] = logRaw.trim().split("\n").map((l: string) => JSON.parse(l));

function minutes(text: string): number {
  const h = /(\d+)\s*h/.exec(text);
  const m = /(\d+)\s*m/.exec(text);
  return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
}

/** The recorded upstream: flights as the tool returns them today, local digits with Z. */
export function recorded(origin: string, destination: string): (Leg & { fare: string })[] {
  const row = LOG.find((r) => r.from === origin && r.to === destination && r.web.length);
  if (!row) return [];
  return row.web.map(([dep, arr, dur, fare]) => ({
    dep: { iata: row.from, time: `2026-12-15T${dep}:00Z` },
    arr: { iata: row.to, time: `2026-12-${arr.includes("+1") ? 16 : 15}T${arr.replace("+1", "")}:00Z` },
    durationMinutes: minutes(dur),
    fare,
  }));
}

export const ROUTES = LOG.filter((r) => r.web.length).map((r) => [r.from, r.to] as const);

const shots = import.meta.glob("../../screenshots/searches/*.jpg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
export function shot(n: number, kind: "chat" | "web"): string | undefined {
  return shots[`../../screenshots/searches/r${String(n).padStart(2, "0")}_${kind}.jpg`];
}
export { default as heroChat } from "../../screenshots/hero_chat.jpg";
export { default as heroWeb } from "../../screenshots/hero_web.jpg";
export { default as quotedShot } from "../../screenshots/quoted_field.jpg";

const abShots = import.meta.glob("../../screenshots/ab/*.jpg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
export function abShot(arm: string): string[] {
  return Object.keys(abShots).filter((k) => k.split("/").pop()!.startsWith(`${arm}_`)).sort().map((k) => abShots[k]);
}
