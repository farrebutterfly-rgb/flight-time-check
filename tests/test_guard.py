from contract import check_leg
from guard import as_utc, guard, guard_flight, local_clock
from upstream import RecordedUpstream


def leg(frm, dep, to, arr, minutes):
    return {"dep": {"iata": frm, "time": dep}, "arr": {"iata": to, "time": arr}, "durationMinutes": minutes}


def test_same_zone_flight_keeps_its_digits_and_gets_the_offset():
    out, reason = guard_flight(leg("ARN", "2026-12-15T22:15:00Z", "GOT", "2026-12-15T23:15:00Z", 60))
    assert reason is None
    assert out["dep"]["time"] == "2026-12-15T22:15:00+01:00"
    assert local_clock(out["dep"]["time"]) == "22:15"
    assert as_utc(out["dep"]["time"]) == "2026-12-15T21:15:00Z"


def test_cross_zone_flight_passes_once_each_airport_has_its_own_offset():
    out, reason = guard_flight(leg("LHR", "2026-12-15T06:40:00Z", "ARN", "2026-12-15T10:05:00Z", 145))
    assert reason is None
    assert out["dep"]["time"].endswith("+00:00") and out["arr"]["time"].endswith("+01:00")
    assert check_leg(out) == []


def test_summer_time_gives_plus_two_in_stockholm():
    out, _ = guard_flight(leg("ARN", "2027-07-15T21:55:00Z", "GOT", "2027-07-15T22:55:00Z", 60))
    assert out["dep"]["time"] == "2027-07-15T21:55:00+02:00"


def test_arrival_after_midnight_keeps_the_next_date():
    out, _ = guard_flight(leg("ARN", "2026-12-15T23:30:00Z", "HEL", "2026-12-16T01:25:00Z", 55))
    assert out["arr"]["time"] == "2026-12-16T01:25:00+02:00"


def test_half_hour_zone():
    out, reason = guard_flight(leg("DXB", "2026-12-15T04:00:00Z", "DEL", "2026-12-15T08:45:00Z", 195))
    assert reason is None and out["arr"]["time"].endswith("+05:30")


def test_a_flight_whose_duration_disagrees_is_held_with_the_reason():
    out, reason = guard_flight(leg("ARN", "2026-12-15T22:15:00Z", "GOT", "2026-12-15T23:15:00Z", 90))
    assert out is None and "durationMinutes says 90" in reason


def test_an_unknown_airport_is_held_not_guessed():
    out, reason = guard_flight(leg("XXX", "2026-12-15T22:15:00Z", "GOT", "2026-12-15T23:15:00Z", 60))
    assert out is None and "XXX" in reason


def test_a_flight_that_is_already_true_passes_through_unchanged():
    good = leg("ZRH", "2026-12-15T07:10:00+01:00", "FCO", "2026-12-15T08:40:00+01:00", 90)
    out, reason = guard_flight(good)
    assert reason is None and out == good


def test_other_fields_survive_the_guard():
    flight = dict(leg("ARN", "2026-12-15T22:15:00Z", "GOT", "2026-12-15T23:15:00Z", 60), fare="586 SEK")
    assert guard([flight])["flights"][0]["fare"] == "586 SEK"


def test_every_recorded_flight_is_shown_and_true_after_the_guard():
    upstream = RecordedUpstream()
    total = 0
    for origin, destination in upstream.routes():
        raw = upstream.search(origin, destination)
        out = guard(raw)
        total += len(raw)
        assert out["held"] == [] and len(out["flights"]) == len(raw)
        assert all(check_leg(f) == [] for f in out["flights"])
    assert len(upstream.routes()) == 25 and total == 211
