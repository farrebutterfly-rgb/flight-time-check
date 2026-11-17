"""Stand-in for the flight tool, built from what was recorded on 17 November 2026.

I do not have access to the real tool. This module returns flights in the shape
ChatGPT quoted from it (airport local clock time with a Z suffix), using the
times read off the website for the same search. A real deployment replaces
RecordedUpstream with a client for the real tool; nothing else changes.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent


def _minutes(text):
    h = re.search(r"(\d+)\s*h", text)
    m = re.search(r"(\d+)\s*m", text)
    return (int(h.group(1)) * 60 if h else 0) + (int(m.group(1)) if m else 0)


class RecordedUpstream:
    """The 25 recorded searches, one-way, 15 December 2026."""

    date = "2026-12-15"

    def __init__(self, path=HERE / "data" / "log.jsonl"):
        with open(path, encoding="utf-8") as f:
            rows = [json.loads(line) for line in f]
        self._rows = {(r["from"], r["to"]): r for r in rows if r["web"]}

    def routes(self):
        return sorted(self._rows)

    def search(self, origin, destination, date=None):
        """Flights for one route, as the tool returns them today: local digits, Z suffix."""
        if date not in (None, self.date):
            raise LookupError(f"only {self.date} was recorded")
        try:
            row = self._rows[(origin.upper(), destination.upper())]
        except KeyError:
            raise LookupError(f"{origin}-{destination} was not recorded") from None
        flights = []
        for dep, arr, dur, fare in row["web"]:
            day = 16 if "+1" in arr else 15
            flights.append({
                "dep": {"iata": row["from"], "time": f"2026-12-15T{dep}:00Z"},
                "arr": {"iata": row["to"], "time": f"2026-12-{day}T{arr.replace('+1', '')}:00Z"},
                "durationMinutes": _minutes(dur),
                "fare": fare,
            })
        return flights
