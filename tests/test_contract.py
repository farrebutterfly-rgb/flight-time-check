from contract import check_leg, to_contract
from replay import run

QUOTED = {  # quoted by ChatGPT from the tool, search 27, 17 Nov 2026
    "dep": {"iata": "ZRH", "time": "2026-12-15T07:10:00Z"},
    "arr": {"iata": "FCO", "time": "2026-12-15T08:40:00Z"},
    "durationMinutes": 90,
}
QUOTED_1 = {  # search 1
    "dep": {"iata": "ARN", "time": "2026-12-15T07:00:00Z"},
    "arr": {"iata": "LGW", "time": "2026-12-15T08:35:00Z"},
    "durationMinutes": 155,
}


def test_quoted_same_zone_leg_breaks_rule_1_only():
    errors = check_leg(QUOTED)
    assert len(errors) == 2 and all("offset" in e for e in errors)


def test_quoted_cross_zone_leg_breaks_both_rules():
    errors = check_leg(QUOTED_1)
    assert any("durationMinutes" in e for e in errors) and any("ARN" in e for e in errors)


def test_fix_passes_and_keeps_the_clock_digits():
    fixed = to_contract(QUOTED)
    assert check_leg(fixed) == []
    assert fixed["dep"]["time"] == "2026-12-15T07:10:00+01:00"
    assert fixed["arr"]["time"] == "2026-12-15T08:40:00+01:00"


def test_fix_cross_zone():
    fixed = to_contract(QUOTED_1)
    assert check_leg(fixed) == []
    assert fixed["arr"]["time"] == "2026-12-15T08:35:00+00:00"


def test_true_utc_airport_passes_as_is():
    leg = {"dep": {"iata": "LHR", "time": "2026-12-15T08:40:00Z"},
           "arr": {"iata": "EDI", "time": "2026-12-15T10:10:00Z"}, "durationMinutes": 90}
    assert check_leg(leg) == []


def test_half_hour_zone():
    leg = {"dep": {"iata": "DEL", "time": "2026-12-15T07:40:00Z"},
           "arr": {"iata": "DXB", "time": "2026-12-15T10:25:00Z"}, "durationMinutes": 255}
    assert check_leg(leg) and check_leg(to_contract(leg)) == []


def test_missing_offset_is_rejected():
    leg = {"dep": {"iata": "ARN", "time": "2026-12-15T07:00:00"},
           "arr": {"iata": "GOT", "time": "2026-12-15T08:00:00"}, "durationMinutes": 60}
    assert any("no offset" in e for e in check_leg(leg))


def test_replay_of_logged_searches():
    res = run()
    assert len(res) == 25
    failing = [r for r in res if r["shipped_fail"]]
    assert len(failing) == 23                      # every search except the two UTC+0 routes
    assert {r["route"] for r in res if not r["shipped_fail"]} == {"LHR-EDI", "LIS-LHR"}
    assert all(r["fixed_fail"] == 0 for r in res)


def test_every_quoted_leg_breaks_rule_1_and_passes_once_fixed():
    import json
    from pathlib import Path
    legs = json.load(open(Path(__file__).parent.parent / "data" / "quoted.json"))["legs"]
    assert len(legs) == 17
    for leg in legs:
        assert any("offset" in e for e in check_leg(leg))
        assert check_leg(to_contract(leg)) == []
