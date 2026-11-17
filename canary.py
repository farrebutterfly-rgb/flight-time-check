"""Canary, tier 1: the two rules on every route, no model involved.

    python3 canary.py            # the tool as it answers today, then through the guard
    python3 canary.py --md       # the same as a Markdown table

Exit code 0 when everything that would be shown passes the contract, 1 otherwise.
Tier 2, the same routes through the app in ChatGPT compared with the website, is
what data/log.jsonl records by hand. classify.py scores it.
"""
import sys

from contract import check_leg
from guard import guard
from upstream import RecordedUpstream


def run(upstream=None):
    upstream = upstream or RecordedUpstream()
    rows = []
    for origin, destination in upstream.routes():
        raw = upstream.search(origin, destination)
        guarded = guard(raw)
        rows.append({
            "route": f"{origin}-{destination}",
            "flights": len(raw),
            "raw_failing": sum(bool(check_leg(f)) for f in raw),
            "shown": len(guarded["flights"]),
            "shown_failing": sum(bool(check_leg(f)) for f in guarded["flights"]),
            "held": len(guarded["held"]),
        })
    return rows


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    rows = run()
    if "--md" in argv:
        print("| Route | Flights | Break a rule today | Shown through the guard | Break a rule | Held |")
        print("|---|---|---|---|---|---|")
        for r in rows:
            print(f"| {r['route']} | {r['flights']} | {r['raw_failing']} | {r['shown']} | {r['shown_failing']} | {r['held']} |")
    else:
        for r in rows:
            print(f"{r['route']}  flights {r['flights']:>2}  today: {r['raw_failing']:>2} break a rule   "
                  f"through the guard: {r['shown']:>2} shown, {r['shown_failing']} break a rule, {r['held']} held")
    routes = len(rows)
    print(f"\nroutes where the tool breaks a rule today:      {sum(r['raw_failing'] > 0 for r in rows)} of {routes}")
    print(f"routes where the guard shows a rule-breaker:    {sum(r['shown_failing'] > 0 for r in rows)} of {routes}")
    print(f"flights held by the guard:                      {sum(r['held'] for r in rows)} of {sum(r['flights'] for r in rows)}")
    return 1 if any(r["shown_failing"] for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
