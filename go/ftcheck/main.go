package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
)

const usage = `ftcheck checks flight legs against the time contract.

  ftcheck legs.json            exit 1 if any leg breaks a rule
  ftcheck -fix legs.json       print the legs with the airport offset attached
  ftcheck -guard legs.json     fix what can be fixed, hold the rest, print both as JSON
  cat legs.json | ftcheck -    read from stdin

The file holds one leg or a list of legs:
  {"dep":{"iata":"ZRH","time":"..."},"arr":{"iata":"FCO","time":"..."},"durationMinutes":90}
`

func readLegs(path string) ([]Leg, error) {
	var data []byte
	var err error
	if path == "-" {
		data, err = io.ReadAll(os.Stdin)
	} else {
		data, err = os.ReadFile(path)
	}
	if err != nil {
		return nil, err
	}
	data = bytes.TrimSpace(data)
	if len(data) > 0 && data[0] == '{' {
		data = append(append([]byte{'['}, data...), ']')
	}
	var legs []Leg
	return legs, json.Unmarshal(data, &legs)
}

func run(args []string, stdout io.Writer) int {
	fs := flag.NewFlagSet("ftcheck", flag.ContinueOnError)
	fs.SetOutput(stdout)
	fix := fs.Bool("fix", false, "print the legs with the airport offset attached")
	guard := fs.Bool("guard", false, "fix what can be fixed, hold the rest")
	fs.Usage = func() { fmt.Fprint(stdout, usage) }
	if err := fs.Parse(args); err != nil || fs.NArg() != 1 {
		fs.Usage()
		return 2
	}
	legs, err := readLegs(fs.Arg(0))
	if err != nil {
		fmt.Fprintln(stdout, "error:", err)
		return 2
	}
	enc := json.NewEncoder(stdout)
	enc.SetIndent("", " ")
	switch {
	case *fix:
		out := make([]Leg, 0, len(legs))
		for _, l := range legs {
			f, err := Fix(l)
			if err != nil {
				fmt.Fprintln(stdout, "error:", err)
				return 1
			}
			out = append(out, f)
		}
		enc.Encode(out)
		return 0
	case *guard:
		type held struct {
			Flight Leg    `json:"flight"`
			Reason string `json:"reason"`
		}
		res := struct {
			Flights []Leg  `json:"flights"`
			Held    []held `json:"held"`
		}{Flights: []Leg{}, Held: []held{}}
		for _, l := range legs {
			if f, reason := Guard(l); reason == "" {
				res.Flights = append(res.Flights, f)
			} else {
				res.Held = append(res.Held, held{l, reason})
			}
		}
		enc.Encode(res)
		if len(res.Held) > 0 {
			return 1
		}
		return 0
	}
	failing := 0
	for i, l := range legs {
		route := l.Dep.IATA + "-" + l.Arr.IATA
		if errs := Check(l); len(errs) > 0 {
			failing++
			fmt.Fprintf(stdout, "leg %d %s: FAIL\n", i+1, route)
			for _, e := range errs {
				fmt.Fprintln(stdout, "   ", e)
			}
		} else {
			fmt.Fprintf(stdout, "leg %d %s: ok\n", i+1, route)
		}
	}
	fmt.Fprintf(stdout, "%d of %d legs break the contract\n", failing, len(legs))
	if failing > 0 {
		return 1
	}
	return 0
}

func main() { os.Exit(run(os.Args[1:], os.Stdout)) }
