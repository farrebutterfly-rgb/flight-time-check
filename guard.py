"""The guard: make the time fields true before a model reads them.

It sits between the flight tool and the model and does three things to every flight:

1. Reads the clock digits as the airport's local time, which is what the website
   shows, and attaches that airport's UTC offset for that date.
2. Checks in code that arrival minus departure equals durationMinutes.
3. Holds the flight if the check fails. A held flight is not shown, and the
   reason is reported.

Why a policy and not a guess: when both airports share a time zone, "local time
labelled UTC" and "really UTC" both add up against the duration. No check can
tell them apart, and that is exactly where the model goes wrong. So the reading
of the digits is a decision by whoever owns the data (DIGITS_ARE), not something
inferred per flight.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

from contract import AIRPORT_TZ, check_leg, to_contract

DIGITS_ARE = "airport_local"  # what the website shows; confirmed by the 17 quoted flights


def _already_true(flight):
    try:
        return check_leg(flight) == []
    except Exception:
        return False


def guard_flight(flight):
    """Return (flight_with_true_times, None) or (None, reason_it_is_held)."""
    for side in ("dep", "arr"):
        iata = flight.get(side, {}).get("iata")
        if iata not in AIRPORT_TZ:
            return None, f"no time zone on file for airport {iata}"
    if _already_true(flight):
        return dict(flight), None
    try:
        fixed = to_contract(flight)
    except (KeyError, ValueError) as e:
        return None, f"time field could not be read: {e}"
    errors = check_leg(fixed)
    if errors:
        return None, "; ".join(errors)
    out = dict(flight)
    out["dep"], out["arr"] = fixed["dep"], fixed["arr"]
    return out, None


def guard(flights):
    """Guard a whole response. Returns what may be shown and what was held, with reasons."""
    shown, held = [], []
    for flight in flights:
        ok, reason = guard_flight(flight)
        if ok:
            shown.append(ok)
        else:
            held.append({"flight": flight, "reason": reason})
    return {
        "flights": shown,
        "held": held,
        "times": "Local time at each airport. Every time carries that airport's UTC offset.",
    }


def local_clock(time_field):
    """'2026-12-15T22:15:00+01:00' -> '22:15'. What a traveller should be shown."""
    return datetime.fromisoformat(time_field).strftime("%H:%M")


def as_utc(time_field):
    """The same instant in UTC, for a client that wants it."""
    return datetime.fromisoformat(time_field).astimezone(ZoneInfo("UTC")).isoformat().replace("+00:00", "Z")
