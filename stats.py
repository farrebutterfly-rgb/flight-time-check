"""Every headline number in the README, computed from the files in data/.

    python3 stats.py
"""
import json
import statistics
from math import sqrt
from pathlib import Path

HERE = Path(__file__).parent
WRONG = ("shifted", "utc_label")


def wilson(k, n, z=1.96):
    """95 percent Wilson interval for k of n, as whole percentages."""
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return round(max(0, centre - half) * 100), round(min(1, centre + half) * 100)


def load(name):
    with open(HERE / "data" / name, encoding="utf-8") as f:
        return json.load(f)


def compute():
    results = [r for r in load("results.json") if r["cls"] != "void"]
    count = lambda cls: sum(r["cls"] == cls for r in results)
    zone = lambda z: [r for r in results if r["zone"] == z]
    wrong = lambda rows: sum(r["cls"] in WRONG for r in rows)
    planned = [r for r in results if r["n"] <= 22]
    fares = []
    for r in results:
        for row in r["rows"]:
            if row["web"]:
                chat = int("".join(c for c in row["fare"] if c.isdigit()))
                web = int("".join(c for c in row["web"][3] if c.isdigit()))
                fares.append(abs(chat - web))
    runs = load("repeat.json")["runs"]
    walls = [r["wall_ms"] / 1000 for r in runs if r["wall_ms"]]
    arms = load("ab.json")["arms"]
    right = lambda keys: (sum(t["right"] for k in keys for t in arms[k]["trials"]),
                          sum(len(arms[k]["trials"]) for k in keys))
    return {
        "searches": len(results),
        "wrong_hour": count("shifted"),
        "shown_as_utc": count("utc_label"),
        "model_corrected": count("rescued"),
        "unaffected": count("ok"),
        "same_zone": (wrong(zone("same")), len(zone("same"))),
        "cross_zone": (wrong(zone("cross")), len(zone("cross"))),
        "planned": (wrong(planned), len(planned)),
        "flights_matched": (sum(r["matched"] for r in results), sum(r["listed"] for r in results)),
        "fare_differs": (sum(d > 0 for d in fares), len(fares)),
        "fare_range_sek": (min(d for d in fares if d), max(fares)),
        "repeat_wrong": (sum(r["result"] == "wrong" for r in runs), len(runs)),
        "repeat_right": sum(r["result"] == "right" for r in runs),
        "repeat_error": sum(r["result"] == "error" for r in runs),
        "seconds_median": round(statistics.median(walls)),
        "seconds_range": (round(min(walls)), round(max(walls))),
        "quoted_flights": len(load("quoted.json")["legs"]),
        "ab_with_z": right("AC"),
        "ab_with_offset": right("BD"),
        "ab_stopgap": right("E"),
    }


if __name__ == "__main__":
    s = compute()
    total_wrong = s["wrong_hour"] + s["shown_as_utc"]
    print(f"searches with flights            {s['searches']}")
    print(f"  wrong hour                     {s['wrong_hour']}")
    print(f"  right digits, shown as UTC     {s['shown_as_utc']}")
    print(f"  model corrected it             {s['model_corrected']}")
    print(f"  unaffected (UTC+0)             {s['unaffected']}")
    lo, hi = wilson(total_wrong, s["searches"])
    print(f"wrong or mislabelled             {total_wrong} of {s['searches']}  (95 % interval {lo} to {hi} %)")
    for key, label in (("same_zone", "same non-UTC zone"), ("cross_zone", "different zones"), ("planned", "planned in advance")):
        k, n = s[key]
        lo, hi = wilson(k, n)
        print(f"  {label:<30} {k} of {n}  ({lo} to {hi} %)")
    print(f"flights matched to a website row {s['flights_matched'][0]} of {s['flights_matched'][1]}")
    print(f"fare differs                     {s['fare_differs'][0]} of {s['fare_differs'][1]}, by {s['fare_range_sek'][0]} to {s['fare_range_sek'][1]} SEK")
    print(f"ten repeats                      {s['repeat_wrong'][0]} wrong, {s['repeat_right']} right, {s['repeat_error']} error")
    print(f"seconds to answer                median {s['seconds_median']}, range {s['seconds_range'][0]} to {s['seconds_range'][1]}")
    print(f"flights quoted by ChatGPT        {s['quoted_flights']}")
    print(f"A/B, as returned today (Z)       {s['ab_with_z'][0]} of {s['ab_with_z'][1]} right")
    print(f"A/B, with the airport offset     {s['ab_with_offset'][0]} of {s['ab_with_offset'][1]} right")
    print(f"A/B, stopgap sentence            {s['ab_stopgap'][0]} of {s['ab_stopgap'][1]} right")
