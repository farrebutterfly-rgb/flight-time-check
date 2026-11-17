package main

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func leg(from, dep, to, arr string, minutes int) Leg {
	return Leg{Dep: Point{from, dep}, Arr: Point{to, arr}, DurationMinutes: minutes}
}

func TestQuotedSameZoneLegBreaksRuleOneOnly(t *testing.T) {
	errs := Check(leg("ZRH", "2026-12-15T07:10:00Z", "FCO", "2026-12-15T08:40:00Z", 90))
	if len(errs) != 2 || !strings.Contains(errs[0], "ZRH is at +01:00") {
		t.Fatalf("got %v", errs)
	}
}

func TestQuotedCrossZoneLegBreaksBothRules(t *testing.T) {
	errs := Check(leg("ARN", "2026-12-15T07:00:00Z", "LGW", "2026-12-15T08:35:00Z", 155))
	joined := strings.Join(errs, "|")
	if !strings.Contains(joined, "durationMinutes says 155") || !strings.Contains(joined, "ARN is at +01:00") {
		t.Fatalf("got %v", errs)
	}
}

func TestFixKeepsTheDigitsAndPasses(t *testing.T) {
	f, err := Fix(leg("ARN", "2026-12-15T22:15:00Z", "GOT", "2026-12-15T23:15:00Z", 60))
	if err != nil || f.Dep.Time != "2026-12-15T22:15:00+01:00" || len(Check(f)) != 0 {
		t.Fatalf("got %+v %v %v", f, err, Check(f))
	}
}

func TestSummerTimeIsPlusTwo(t *testing.T) {
	f, _ := Fix(leg("ARN", "2027-07-15T21:55:00Z", "GOT", "2027-07-15T22:55:00Z", 60))
	if f.Dep.Time != "2027-07-15T21:55:00+02:00" {
		t.Fatalf("got %s", f.Dep.Time)
	}
}

func TestHalfHourZone(t *testing.T) {
	f, reason := Guard(leg("DXB", "2026-12-15T04:00:00Z", "DEL", "2026-12-15T08:45:00Z", 195))
	if reason != "" || !strings.HasSuffix(f.Arr.Time, "+05:30") {
		t.Fatalf("got %+v %q", f, reason)
	}
}

func TestWrongDurationIsHeld(t *testing.T) {
	_, reason := Guard(leg("ARN", "2026-12-15T22:15:00Z", "GOT", "2026-12-15T23:15:00Z", 90))
	if !strings.Contains(reason, "durationMinutes says 90") {
		t.Fatalf("got %q", reason)
	}
}

func TestUnknownAirportIsHeld(t *testing.T) {
	_, reason := Guard(leg("XXX", "2026-12-15T22:15:00Z", "GOT", "2026-12-15T23:15:00Z", 60))
	if !strings.Contains(reason, "XXX") {
		t.Fatalf("got %q", reason)
	}
}

func TestAirportTableMatchesTheSharedOne(t *testing.T) {
	shared, err := os.ReadFile("../../data/airports.json")
	if err != nil {
		t.Skip("shared table not found")
	}
	if !bytes.Equal(bytes.TrimSpace(shared), bytes.TrimSpace(airportsJSON)) {
		t.Fatal("go/ftcheck/airports.json differs from data/airports.json; run make sync")
	}
}

func TestAllSeventeenQuotedLegsFail(t *testing.T) {
	var out bytes.Buffer
	code := run([]string{"../../examples/quoted_all.json"}, &out)
	if code != 1 || !strings.Contains(out.String(), "17 of 17 legs break the contract") {
		t.Fatalf("code %d, out %s", code, out.String())
	}
}

func TestGuardOnTheQuotedLegsShowsAllAndHoldsNone(t *testing.T) {
	var out bytes.Buffer
	if code := run([]string{"-guard", "../../examples/quoted_all.json"}, &out); code != 0 {
		t.Fatalf("code %d, out %s", code, out.String())
	}
	if strings.Contains(out.String(), "Z\"") {
		t.Fatal("a Z time survived the guard")
	}
}
