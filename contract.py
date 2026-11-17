"""Contract for the time fields a flight tool hands to a language model.

Rule 1. dep.time and arr.time are the airport's local wall-clock time and carry
        that airport's UTC offset (RFC 3339), for example 2026-12-15T07:10:00+01:00.
Rule 2. arr.time minus dep.time equals durationMinutes.

A value such as 2026-12-15T07:10:00Z for a 07:10 local departure from Zurich breaks
rule 1: Z says UTC, the airport is at +01:00.
"""
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

AIRPORT_TZ = json.loads((Path(__file__).parent / "data" / "airports.json").read_text(encoding="utf-8"))


def _parse(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def airport_offset(iata, local_naive):
    return ZoneInfo(AIRPORT_TZ[iata]).utcoffset(local_naive)


def check_leg(leg):
    """Return a list of contract violations for one leg. Empty list means it passes."""
    errors, parsed = [], {}
    for side in ("dep", "arr"):
        iata, raw = leg[side]["iata"], leg[side]["time"]
        t = _parse(raw)
        if t.tzinfo is None:
            errors.append(f"{side}.time {raw} has no offset")
            continue
        want = airport_offset(iata, t.replace(tzinfo=None))
        if t.utcoffset() != want:
            errors.append(f"{side}.time {raw} carries offset {t.utcoffset()} but {iata} is at {want}")
        parsed[side] = t
    if len(parsed) == 2:
        got = (parsed["arr"] - parsed["dep"]) / timedelta(minutes=1)
        if got != leg["durationMinutes"]:
            errors.append(f"arr minus dep is {got:.0f} min, durationMinutes says {leg['durationMinutes']}")
    return errors


def to_contract(leg):
    """The fix: read the clock digits as the airport's local time and attach its offset."""
    out = {"durationMinutes": leg["durationMinutes"]}
    for side in ("dep", "arr"):
        iata = leg[side]["iata"]
        naive = _parse(leg[side]["time"]).replace(tzinfo=None)
        aware = naive.replace(tzinfo=ZoneInfo(AIRPORT_TZ[iata]))
        out[side] = {"iata": iata, "time": aware.isoformat()}
    return out
