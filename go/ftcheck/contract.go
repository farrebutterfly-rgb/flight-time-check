// Package main is ftcheck: the flight time contract as one static binary.
//
// It checks flight legs the way a flight tool hands them to a language model:
//
//	Rule 1. dep.time and arr.time are the airport's local clock time and carry
//	        that airport's UTC offset (RFC 3339).
//	Rule 2. arr.time minus dep.time equals durationMinutes.
//
// The binary has no runtime dependencies. The time zone database and the
// airport table are compiled in, so it runs the same in CI, in a container
// and on a laptop.
package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	_ "time/tzdata"
)

//go:embed airports.json
var airportsJSON []byte

// Airports maps an IATA code to its IANA time zone.
var Airports = mustAirports()

func mustAirports() map[string]string {
	m := map[string]string{}
	if err := json.Unmarshal(airportsJSON, &m); err != nil {
		panic(err)
	}
	return m
}

// Point is one end of a leg.
type Point struct {
	IATA string `json:"iata"`
	Time string `json:"time"`
}

// Leg is one flight as the tool returns it. Unknown fields are kept in Extra.
type Leg struct {
	Dep             Point          `json:"dep"`
	Arr             Point          `json:"arr"`
	DurationMinutes int            `json:"durationMinutes"`
	Extra           map[string]any `json:"-"`
}

func location(iata string) (*time.Location, error) {
	zone, ok := Airports[strings.ToUpper(iata)]
	if !ok {
		return nil, fmt.Errorf("no time zone on file for airport %s", iata)
	}
	return time.LoadLocation(zone)
}

func parse(raw string) (time.Time, bool, error) {
	t, err := time.Parse(time.RFC3339, raw)
	if err == nil {
		return t, true, nil
	}
	t, err2 := time.Parse("2006-01-02T15:04:05", raw)
	if err2 == nil {
		return t, false, nil
	}
	return time.Time{}, false, fmt.Errorf("cannot read time %q: %v", raw, err)
}

func offsetString(seconds int) string {
	sign := "+"
	if seconds < 0 {
		sign, seconds = "-", -seconds
	}
	return fmt.Sprintf("%s%02d:%02d", sign, seconds/3600, seconds%3600/60)
}

// Check returns the contract violations for one leg. An empty slice means it passes.
func Check(leg Leg) []string {
	var errs []string
	parsed := map[string]time.Time{}
	for _, side := range []struct {
		name string
		p    Point
	}{{"dep", leg.Dep}, {"arr", leg.Arr}} {
		t, hasOffset, err := parse(side.p.Time)
		if err != nil {
			errs = append(errs, side.name+".time "+err.Error())
			continue
		}
		if !hasOffset {
			errs = append(errs, fmt.Sprintf("%s.time %s has no offset", side.name, side.p.Time))
			continue
		}
		loc, err := location(side.p.IATA)
		if err != nil {
			errs = append(errs, err.Error())
			continue
		}
		wall := time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), 0, loc)
		_, want := wall.Zone()
		_, got := t.Zone()
		if got != want {
			errs = append(errs, fmt.Sprintf("%s.time %s carries offset %s but %s is at %s",
				side.name, side.p.Time, offsetString(got), strings.ToUpper(side.p.IATA), offsetString(want)))
		}
		parsed[side.name] = t
	}
	if len(parsed) == 2 {
		got := int(parsed["arr"].Sub(parsed["dep"]).Minutes())
		if got != leg.DurationMinutes {
			errs = append(errs, fmt.Sprintf("arr minus dep is %d min, durationMinutes says %d", got, leg.DurationMinutes))
		}
	}
	return errs
}

// Fix reads the clock digits as the airport's local time and attaches its offset.
func Fix(leg Leg) (Leg, error) {
	out := leg
	for _, side := range []*Point{&out.Dep, &out.Arr} {
		t, _, err := parse(side.Time)
		if err != nil {
			return leg, err
		}
		loc, err := location(side.IATA)
		if err != nil {
			return leg, err
		}
		wall := time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), 0, loc)
		side.Time = wall.Format("2006-01-02T15:04:05-07:00")
	}
	return out, nil
}

// Guard fixes a leg, then holds it if it still breaks the contract.
func Guard(leg Leg) (Leg, string) {
	if len(Check(leg)) == 0 {
		return leg, ""
	}
	fixed, err := Fix(leg)
	if err != nil {
		return Leg{}, err.Error()
	}
	if errs := Check(fixed); len(errs) > 0 {
		return Leg{}, strings.Join(errs, "; ")
	}
	return fixed, ""
}
