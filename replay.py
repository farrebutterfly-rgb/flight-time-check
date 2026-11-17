"""Replay the 25 logged searches against the contract.

Ground truth is the Flight Network website (the web rows in data/log.jsonl).
The payload shape is the one ChatGPT quoted from the tool in searches 1 and 27:
"dep":{"iata":..,"time":"2026-12-15T07:10:00Z"},"arr":{..},"durationMinutes":90
For the other searches the payload is rebuilt in that shape from the website's local times.
"""
import json, re, sys
from pathlib import Path
from contract import check_leg, to_contract

HERE = Path(__file__).parent


def _minutes(text):
    h = re.search(r"(\d+)\s*h", text); m = re.search(r"(\d+)\s*m", text)
    return (int(h.group(1)) * 60 if h else 0) + (int(m.group(1)) if m else 0)


def shipped_legs(row):
    """One leg per website row, in the shape the tool returns today (local digits, Z)."""
    legs = []
    for dep, arr, dur, _fare in row["web"]:
        day = 16 if "+1" in arr else 15
        legs.append({
            "dep": {"iata": row["from"], "time": f"2026-12-15T{dep}:00Z"},
            "arr": {"iata": row["to"], "time": f"2026-12-{day}T{arr.replace('+1', '')}:00Z"},
            "durationMinutes": _minutes(dur),
        })
    return legs


def run():
    rows = [json.loads(l) for l in open(HERE / "data" / "log.jsonl")]
    out = []
    for row in rows:
        if not row["web"]:
            continue
        legs = shipped_legs(row)
        out.append({
            "n": row["n"], "route": f"{row['from']}-{row['to']}", "legs": len(legs),
            "shipped_fail": sum(bool(check_leg(l)) for l in legs),
            "fixed_fail": sum(bool(check_leg(to_contract(l))) for l in legs),
        })
    return out


if __name__ == "__main__":
    res = run()
    for r in res:
        print(f"{r['n']:>2} {r['route']}  legs {r['legs']:>2}  as returned today: {r['shipped_fail']:>2} fail   with offset: {r['fixed_fail']} fail")
    print("searches with at least one failing leg, as returned today:", sum(r["shipped_fail"] > 0 for r in res), "of", len(res))
    print("searches with at least one failing leg, with offset:", sum(r["fixed_fail"] > 0 for r in res), "of", len(res))
    json.dump(res, open(HERE / "data" / "replay.json", "w"), indent=1)
