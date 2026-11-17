/**
 * The guard: make the time fields true before a model reads them.
 * Attach the airport offset, check the duration, hold what still fails.
 */
import { AIRPORT_TZ, checkLeg, type Leg, toContract } from "./contract.js";

export interface Held {
  flight: Leg;
  reason: string;
}

export interface Guarded {
  flights: Leg[];
  held: Held[];
  times: string;
}

export function guardFlight(flight: Leg): { flight: Leg; reason: null } | { flight: null; reason: string } {
  for (const side of ["dep", "arr"] as const) {
    const iata = flight?.[side]?.iata;
    if (!iata || !(iata.toUpperCase() in AIRPORT_TZ)) {
      return { flight: null, reason: `no time zone on file for airport ${iata}` };
    }
  }
  if (checkLeg(flight).length === 0) return { flight: { ...flight }, reason: null };
  let fixed: Leg;
  try {
    fixed = toContract(flight);
  } catch (e) {
    return { flight: null, reason: `time field could not be read: ${(e as Error).message}` };
  }
  const errors = checkLeg(fixed);
  if (errors.length) return { flight: null, reason: errors.join("; ") };
  return { flight: fixed, reason: null };
}

export function guard(flights: Leg[]): Guarded {
  const out: Guarded = {
    flights: [],
    held: [],
    times: "Local time at each airport. Every time carries that airport's UTC offset.",
  };
  for (const f of flights) {
    const r = guardFlight(f);
    if (r.flight) out.flights.push(r.flight);
    else out.held.push({ flight: f, reason: r.reason });
  }
  return out;
}

/** '2026-12-15T22:15:00+01:00' -> '22:15', what a traveller should be shown. */
export function localClock(time: string): string {
  return time.slice(11, 16);
}
