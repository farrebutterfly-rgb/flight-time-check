import asyncio
import json

import pytest

import canary
import check
import classify
import stats


def test_classify_reproduces_the_committed_results():
    committed = json.load(open(classify.HERE / "data" / "results.json", encoding="utf-8"))
    assert json.loads(json.dumps(classify.run())) == committed


def test_headline_numbers():
    s = stats.compute()
    assert (s["searches"], s["wrong_hour"], s["shown_as_utc"], s["model_corrected"], s["unaffected"]) == (25, 6, 6, 11, 2)
    assert s["same_zone"] == (11, 12) and s["cross_zone"] == (1, 11) and s["planned"] == (7, 20)
    assert s["flights_matched"] == (100, 108) and s["fare_differs"] == (14, 100)
    assert s["repeat_wrong"] == (8, 10) and s["seconds_median"] == 43 and s["seconds_range"] == (39, 88)
    assert s["ab_with_z"] == (0, 8) and s["ab_with_offset"] == (8, 8) and s["ab_stopgap"] == (3, 3)
    assert s["quoted_flights"] == 17


def test_wilson_interval():
    assert stats.wilson(11, 12) == (65, 99) and stats.wilson(1, 11) == (2, 38)


def test_check_cli_fails_on_the_quoted_field_and_passes_on_the_fix(capsys):
    assert check.main(["examples/quoted_zrh_fco.json"]) == 1
    assert "ZRH is at 1:00:00" in capsys.readouterr().out
    assert check.main(["examples/quoted_all.json"]) == 1
    assert "17 of 17 legs break the contract" in capsys.readouterr().out


def test_canary_passes_through_the_guard_and_shows_what_breaks_today():
    rows = canary.run()
    assert len(rows) == 25
    assert sum(r["raw_failing"] > 0 for r in rows) == 23
    assert sum(r["shown_failing"] for r in rows) == 0 and sum(r["held"] for r in rows) == 0
    assert canary.main([]) == 0


def test_mcp_server_returns_true_times():
    pytest.importorskip("mcp")
    import server

    async def call():
        tools = {t.name for t in await server.mcp.list_tools()}
        result = await server.mcp.call_tool("search_flights", {"origin": "ARN", "destination": "GOT"})
        return tools, result

    tools, result = asyncio.run(call())
    assert {"search_flights", "check_flights"} <= tools
    if isinstance(result, tuple):          # mcp 1.x: (content, structured)
        payload = result[1]
    elif hasattr(result, "content"):       # mcp 2.x: CallToolResult
        payload = json.loads(result.content[0].text)
    else:                                  # older 1.x: list of content
        payload = json.loads(result[0].text)
    times = [f["dep"]["time"] for f in payload["flights"]]
    assert "2026-12-15T22:15:00+01:00" in times and not any(t.endswith("Z") for t in times)
    assert server.search_flights("ARN", "XXX")["error"]


def test_sql_queries_agree_with_stats():
    import sqlite3
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "sql"))
    import run as sqlrun

    db = sqlite3.connect(":memory:")
    sqlrun.load(db)
    out = sqlrun.run_all(db)
    zones = {row[0]: row for row in out["outcome_by_zone"][1]}
    assert zones["same"][1:5] == (12, 5, 6, 11) and zones["cross"][4] == 1
    assert out["flights_matched"][1][0] == (108, 100, 14)
    assert out["repeats"][1][0][:4] == (8, 1, 1, 43.0)
    assert dict((r[0], r[2]) for r in out["ab_by_format"][1]) == {"offset": 8, "stopgap": 3, "z": 0}


def test_every_language_uses_the_same_airport_table():
    from pathlib import Path

    root = Path(__file__).resolve().parent.parent
    shared = (root / "data" / "airports.json").read_text(encoding="utf-8").strip()
    for copy in ("go/ftcheck/airports.json", "ts/src/airports.json"):
        path = root / copy
        if path.exists():
            assert path.read_text(encoding="utf-8").strip() == shared, copy
