/**
 * The flight time contract.
 *
 * Rule 1. dep.time and arr.time are the airport's local clock time and carry
 *         that airport's UTC offset (RFC 3339), e.g. 2026-12-15T07:10:00+01:00.
 * Rule 2. arr.time minus dep.time equals durationMinutes.
 *
 * No dependencies: time zones come from the runtime's Intl database, so the
 * same file runs in Node, in a browser and in an edge function.
 */
import airports from "./airports.json" with { type: "json" };

export const AIRPORT_TZ: Record<string, string> = airports;

export interface Point {
  iata: string;
  time: string;
}

export interface Leg {
  dep: Point;
  arr: Point;
  durationMinutes: number;
  [extra: string]: unknown;
}

interface Parsed {
  wall: number; // the clock digits read as if they were UTC, in ms
  offsetMin: number | null; // the offset written in the string, null if none
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/;

export function parse(value: string): Parsed {
  const m = ISO.exec(value);
  if (!m) throw new Error(`cannot read time ${JSON.stringify(value)}`);
  const [, y, mo, d, h, mi, s, off] = m;
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
  let offsetMin: number | null = null;
  if (off === "Z") offsetMin = 0;
  else if (off) offsetMin = (off[0] === "-" ? -1 : 1) * (+off.slice(1, 3) * 60 + +off.slice(4, 6));
  return { wall, offsetMin };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function offsetAtInstant(zone: string, instant: number): number {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" });
    formatters.set(zone, f);
  }
  const name = f.formatToParts(new Date(instant)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
}

/** UTC offset in minutes of an airport for a given local clock time. */
export function airportOffset(iata: string, wall: number): number {
  const zone = AIRPORT_TZ[iata.toUpperCase()];
  if (!zone) throw new Error(`no time zone on file for airport ${iata}`);
  const first = offsetAtInstant(zone, wall);
  const second = offsetAtInstant(zone, wall - first * 60_000);
  return second;
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const a = Math.abs(minutes);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** Contract violations for one leg. An empty list means it passes. */
export function checkLeg(leg: Leg): string[] {
  const errors: string[] = [];
  const instants: Record<string, number> = {};
  for (const side of ["dep", "arr"] as const) {
    const { iata, time } = leg[side];
    let p: Parsed;
    try {
      p = parse(time);
    } catch (e) {
      errors.push(`${side}.time ${(e as Error).message}`);
      continue;
    }
    if (p.offsetMin === null) {
      errors.push(`${side}.time ${time} has no offset`);
      continue;
    }
    let want: number;
    try {
      want = airportOffset(iata, p.wall);
    } catch (e) {
      errors.push((e as Error).message);
      continue;
    }
    if (p.offsetMin !== want) {
      errors.push(
        `${side}.time ${time} carries offset ${formatOffset(p.offsetMin)} but ${iata.toUpperCase()} is at ${formatOffset(want)}`,
      );
    }
    instants[side] = p.wall - p.offsetMin * 60_000;
  }
  if ("dep" in instants && "arr" in instants) {
    const got = Math.round((instants.arr - instants.dep) / 60_000);
    if (got !== leg.durationMinutes) {
      errors.push(`arr minus dep is ${got} min, durationMinutes says ${leg.durationMinutes}`);
    }
  }
  return errors;
}

function isoWithOffset(wall: number, offsetMin: number): string {
  return new Date(wall).toISOString().slice(0, 19) + formatOffset(offsetMin);
}

/** The fix: read the clock digits as the airport's local time and attach its offset. */
export function toContract(leg: Leg): Leg {
  const out: Leg = { ...leg, dep: { ...leg.dep }, arr: { ...leg.arr } };
  for (const side of ["dep", "arr"] as const) {
    const { wall } = parse(leg[side].time);
    out[side].time = isoWithOffset(wall, airportOffset(leg[side].iata, wall));
  }
  return out;
}
