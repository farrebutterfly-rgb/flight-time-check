"""The finding in ten lines: one route, before and after the guard.

    python3 demo.py                # Stockholm to Gothenburg
    python3 demo.py ZRH FCO
"""
import sys

from guard import as_utc, guard, local_clock
from upstream import RecordedUpstream

origin, destination = (sys.argv[1:3] + ["ARN", "GOT"])[:2] if len(sys.argv) >= 3 else ("ARN", "GOT")
raw = RecordedUpstream().search(origin, destination)
out = guard(raw)

print(f"{origin} to {destination}, 15 December 2026\n")
print("What the tool returns today            What the guard hands the model        Traveller sees")
for before, after in zip(raw, out["flights"]):
    print(f"{before['dep']['time']:<38} {after['dep']['time']:<37} "
          f"{local_clock(after['dep']['time'])} to {local_clock(after['arr']['time'])}   (UTC {as_utc(after['dep']['time'])[11:16]})")
print(f"\n{len(out['flights'])} shown, {len(out['held'])} held. {out['times']}")
