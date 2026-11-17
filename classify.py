"""Classify each logged search by comparing what ChatGPT showed with the website.

Input:  data/log.jsonl   one line per search (ChatGPT rows, ChatGPT's note, website rows)
Output: data/results.json

A flight ChatGPT listed is matched to a website row with the same duration whose
times differ by a whole number of hours (at most three). The search is then put
in one of five classes:

    shifted    every matched flight shows a different hour than the website
    utc_label  the digits match the website, but the answer presents them as UTC
    rescued    the digits match, and the model says it overrode the UTC marker
    ok         the digits match and nothing could go wrong (both airports at UTC+0)
    void       the search returned no nonstop flights

One thing is set by hand: whether an answer presents its times as UTC
(PRESENTED_AS_UTC). ChatGPT's own note is kept for every search so it can be checked.
"""
import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from contract import AIRPORT_TZ

HERE = Path(__file__).parent
TRAVEL_DAY = datetime(2026, 12, 15, 12, 0)
PRESENTED_AS_UTC = {8, 13, 22, 23, 26, 27}  # read off the answers, see chat_note in the log


def offset_hours(iata):
    hours = ZoneInfo(AIRPORT_TZ[iata]).utcoffset(TRAVEL_DAY).total_seconds() / 3600
    return int(hours) if hours == int(hours) else hours


def minutes(clock):
    next_day = 1440 if "+1" in clock else 0
    h, m = clock.replace("+1", "").split(":")
    return int(h) * 60 + int(m) + next_day


def duration(text):
    h = re.search(r"(\d+)\s*h", text)
    m = re.search(r"(\d+)\s*m", text)
    return (int(h.group(1)) * 60 if h else 0) + (int(m.group(1)) if m else 0)


def match(chat_row, web_rows):
    """Closest website row with the same duration and a whole-hour difference."""
    dep, arr, dur = minutes(chat_row[1]), minutes(chat_row[2]), duration(chat_row[3])
    best = None
    for web in web_rows:
        if duration(web[2]) != dur:
            continue
        shift_dep, shift_arr = dep - minutes(web[0]), arr - minutes(web[1])
        if shift_dep % 60 or shift_arr % 60 or abs(shift_dep) > 180 or abs(shift_arr) > 180:
            continue
        distance = abs(shift_dep) + abs(shift_arr)
        if best is None or distance < best[0]:
            best = (distance, shift_dep, shift_arr, web)
    return best


def classify(row):
    n, note = row["n"], row.get("chat_note", "")
    off_from, off_to = offset_hours(row["from"]), offset_hours(row["to"])
    res = dict(n=n, frm=row["from"], to=row["to"], off_from=off_from, off_to=off_to,
               note=note, chat=row["chat"], web=row["web"])
    if not row["chat"]:
        res["cls"] = "void"
        return res
    rows = []
    for chat_row in row["chat"]:
        best = match(chat_row, row["web"])
        rows.append(dict(fn=chat_row[0], dep=chat_row[1], arr=chat_row[2], dur=chat_row[3], fare=chat_row[4],
                         web=best[3] if best else None,
                         sd=best[1] if best else None, sa=best[2] if best else None))
    matched = [r for r in rows if r["web"]]
    shifted = [r for r in matched if r["sd"] or r["sa"]]
    same_zone = off_from == off_to
    res.update(rows=rows, matched=len(matched), listed=len(rows), shifted_rows=len(shifted),
               mentions_utc=bool(re.search(r"UTC(?![+\-]\d)|\bZ\b", note)),
               zone="utc0" if same_zone and off_from == 0 else ("same" if same_zone else "cross"))
    if shifted and len(shifted) == len(matched):
        res["cls"] = "shifted"
        res["shift"] = (shifted[0]["sd"], shifted[0]["sa"])
    elif shifted:
        res["cls"] = "mixed"
    elif n in PRESENTED_AS_UTC:
        res["cls"] = "utc_label"
    elif res["mentions_utc"]:
        res["cls"] = "rescued"
    else:
        res["cls"] = "ok"
    return res


def run():
    with open(HERE / "data" / "log.jsonl", encoding="utf-8") as f:
        return [classify(json.loads(line)) for line in f]


if __name__ == "__main__":
    results = run()
    with open(HERE / "data" / "results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    print(dict(Counter(r["cls"] for r in results)))
    for zone in ("same", "cross", "utc0"):
        print(zone, dict(Counter(r["cls"] for r in results if r.get("zone") == zone)))
