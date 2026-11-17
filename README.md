# Flight time check

A live test of the Flight Network app inside ChatGPT, checked against se.flightnetwork.com.

By Faris Sadik, 17 November 2026. An independent test of public pages, with no access to internal systems or data.

## The finding

Same flight, same fare, one hour apart.

| ChatGPT, Flight Network app | se.flightnetwork.com, opened from that answer |
|---|---|
| ![ChatGPT lists SK 171 at 23:15, arriving 00:15 on 16 December](screenshots/hero_chat.jpg) | ![The website shows the same 586 SEK flight at 22:15, arriving 23:15 on 15 December](screenshots/hero_web.jpg) |
| SK 171, 586 SEK: **23:15 → 00:15, 16 Dec** | Same flight, same fare: **22:15 → 23:15, 15 Dec** |

I ran 25 one-way flight searches for 15 December 2026 and opened the link each answer gives to the website.

| Outcome | Searches |
|---|---|
| The chat shows a different hour than the website | 6 |
| Right digits, but presented as UTC | 6 |
| Right, and the model says it overrode the UTC marker | 11 |
| Right, both airports at UTC+0 | 2 |

- Both airports in the same non-UTC time zone: 11 of 12 wrong or mislabelled.
- Airports in different time zones: 1 of 11.
- 100 of the 108 flights ChatGPT listed were matched to a row on the first website page.

The booking page shows the right time in every case. The exposure is a traveller who plans from the chat alone.

## The same search, ten more times

Stockholm to Gothenburg, repeated ten times in new chats (`data/repeat.json`): 8 showed 23:15 for the 22:15 flight, 1 was right, 1 ended in a ChatGPT error with no answer. From sending the question to a finished answer took a median of 43 seconds over the nine answers, range 39 to 88. The one right answer was the 88 second one: the model searched the web for the schedule before it trusted the tool.

## Cause, as far as it can be seen from outside

ChatGPT quoted the tool's fields in ten conversations, 17 flights (`data/quoted.json`). The value is local clock time with a `Z` suffix, and `Z` means UTC.

![ChatGPT quoting dep.time 2026-12-15T07:10:00Z for a flight the website shows at 07:10 local](screenshots/quoted_field.jpg)

```
"dep": { "iata": "ZRH", "time": "2026-12-15T07:10:00Z" }
"arr": { "iata": "FCO", "time": "2026-12-15T08:40:00Z" }
"durationMinutes": 90
```

The website shows this flight leaving Zurich at 07:10 local time.

Why only some answers go wrong: the model checks the times against the duration. Across two time zones the numbers clash and the model trusts the duration. Inside one time zone nothing clashes, so the model believes the label.

I have not seen the tool's response directly, only ChatGPT's quote of it. MCP access is by application.

## The fix, and the test of it

Two rules, in `contract.py`:

1. Departure and arrival are the airport's local clock time and carry that airport's UTC offset.
2. Arrival minus departure equals `durationMinutes`.

```
"dep": { "iata": "ZRH", "time": "2026-12-15T07:10:00+01:00" }
```

A/B on the same consumer model (`data/ab.json`, screenshots in `screenshots/ab/`): three real flights pasted as a tool result into a new chat, Zurich to Rome five times per arm and London to Stockholm three times per arm.

| Format of the time field | Right local times |
|---|---|
| As returned today, with `Z` | 0 of 8 |
| With the airport's offset | 8 of 8 |
| Stopgap: `Z` kept, plus one sentence saying the times are local | 3 of 3, each with a remark that the `Z` conflicts |

The stopgap buys time. It does not remove the fault, and it does not help a client that parses the field with a date library.

In summer the gap is two hours. One extra search for 15 July 2027, Stockholm to Gothenburg: ChatGPT 23:55 → 00:55 next day, website 21:55 → 22:55.

| ChatGPT | Website |
|---|---|
| ![ChatGPT answer for 15 July 2027](screenshots/summer_chat.jpg) | ![Website for 15 July 2027](screenshots/summer_web.jpg) |

## The prototype: a guard in front of the tool

The repository is more than the finding. It holds a working fix that can run today, in front of the tool, without touching the tool itself.

```
flight tool  →  guard.py  →  model in ChatGPT  →  traveller
(local digits, Z)   (true offset, checked)
```

`guard.py` does three things to every flight before a model may read it:

1. Reads the clock digits as the airport's local time and attaches that airport's UTC offset for that date.
2. Checks in code that arrival minus departure equals `durationMinutes`.
3. Holds the flight if the check fails. A held flight is not shown, and the reason is reported.

```
$ python3 demo.py
ARN to GOT, 15 December 2026

What the tool returns today            What the guard hands the model        Traveller sees
2026-12-15T22:15:00Z                   2026-12-15T22:15:00+01:00             22:15 to 23:15   (UTC 21:15)
```

Why the reading of the digits is a policy and not a guess: when both airports share a time zone, "local time labelled UTC" and "really UTC" both add up against the duration. No check can tell them apart, and that is exactly where the model goes wrong. So the guard is told once, by whoever owns the data, what the digits mean.

### As an MCP server

`server.py` is an MCP server with the guard in front of the flight search. A model that calls `search_flights` gets time fields that are already true.

```
pip install mcp
python3 server.py
```

| Tool | What it does |
|---|---|
| `search_flights(origin, destination, date)` | Flights with local time and the airport's offset. Held flights are listed with the reason |
| `check_flights(flights)` | Runs the contract on any response and returns the violations |

The upstream is `upstream.py`, a recording of the 25 searches in the shape ChatGPT quoted, because I have no access to the real tool. To use it for real, replace `RecordedUpstream` with a client for the real tool. Nothing else changes.

### As a canary

```
$ python3 canary.py
routes where the tool breaks a rule today:      23 of 25
routes where the guard shows a rule-breaker:    0 of 25
flights held by the guard:                      0 of 211
```

It exits with code 1 if anything that would be shown breaks the contract, so it can run daily and in CI. No model is involved.

### On any response

```
$ python3 check.py examples/quoted_zrh_fco.json
leg 1 ZRH-FCO: FAIL
    dep.time 2026-12-15T07:10:00Z carries offset 0:00:00 but ZRH is at 1:00:00
    arr.time 2026-12-15T08:40:00Z carries offset 0:00:00 but FCO is at 1:00:00
1 of 1 legs break the contract

$ python3 check.py --fix examples/quoted_zrh_fco.json | python3 check.py -
leg 1 ZRH-FCO: ok
```

## Run it

Python 3.9 or later. The checks use the standard library only. `pytest` for the tests and `mcp` for the server.

```
python3 -m pytest -q      # 25 tests
python3 stats.py          # every number in this README, computed from data/
python3 classify.py       # rebuilds data/results.json from data/log.jsonl
python3 canary.py         # the two rules on all 25 routes, before and after the guard
python3 demo.py ZRH FCO   # one route, before and after
python3 replay.py         # 23 of 25 searches break a rule as returned today, 0 of 25 with the offset
```

`replay.py` and `canary.py` rebuild payloads from the website's times, so their 23 of 25 follows from the time zones. The direct evidence is the 17 quoted flights and the 16 A/B trials.

All 48 search screenshots, search by search, are in [SEARCHES.md](SEARCHES.md).

## Check it yourself in two minutes

1. Open ChatGPT with the Flight Network app added.
2. Ask for one-way flights from Stockholm Arlanda to Gothenburg on 15 December 2026.
3. Open the Flight Network link in the answer and compare the departure times.

The answer varies from run to run. Routes inside one time zone are where it fails.

## What is in the repository

| Path | What |
|---|---|
| `contract.py` | The two rules, and `to_contract()` which shows the change |
| `guard.py` | The fix as running code: attach the offset, check the duration, hold what fails |
| `server.py` | MCP server with the guard in front of the flight search |
| `upstream.py` | Stand-in for the real tool, built from the recording |
| `canary.py` | The two rules on all 25 routes, with an exit code |
| `check.py` | Command line check and fix for any response |
| `classify.py` | Matches what ChatGPT showed to the website and classifies each search |
| `stats.py` | Every headline number, with 95 percent intervals |
| `replay.py` | Runs the rules over the 25 logged searches |
| `gallery.py` | Writes `SEARCHES.md` |
| `tests/` | 25 tests, run in GitHub Actions on every push |
| `data/log.jsonl` | One line per search: ChatGPT rows, ChatGPT's own note, website rows |
| `data/results.json` | Classification per search, written by `classify.py` |
| `data/quoted.json` | The 17 flights whose fields ChatGPT quoted |
| `data/ab.json` | The nineteen A/B trials |
| `data/repeat.json` | Ten repeats of one search, with time to answer |
| `data/latency.json` | The "worked for" times read off ChatGPT |
| `examples/` | The quoted fields as files for `check.py` |
| `screenshots/searches/` | ChatGPT and website for each search, `rNN_chat.jpg` and `rNN_web.jpg` |
| `screenshots/ab/` | The A/B trials: A and C with `Z`, B and D with the offset, E the stopgap |
| `SEARCHES.md` | Every search with its class and both screenshots |
| [Release v1.0](https://github.com/farrebutterfly-rgb/flight-time-check/releases/tag/v1.0) | The full report as one HTML page, `Flight_time_check_report.html`. Download it and open it in a browser |

## Limits

- One day, one account, one model setting (GPT-6.1 Sol, Medium), one market, one travel date.
- Searches 1 to 22 were planned in advance: 7 of 20 valid ones were wrong. Searches 23 to 27 were chosen after the first 22, to test the same-zone explanation: 5 of 5 wrong. The 12 of 25 total includes them. Searches 9 and 16 returned no nonstop flights and are kept in the log as void.
- The answer changes between runs. A newer model may repair more or fewer.
- The A/B pasted the payload as text. It was not delivered through the app, and it covers two routes.
- Fares: in 14 of 100 matched flights the fare in the chat differs from the matched website row by 2 to 31 SEK. Matching is by time and duration, not flight number, so this is an observation, not a finding.
- The guard and the server run against a recording, not against the real tool. I have no MCP access.
- Nobody was booked on a wrong flight in this test.

## Licence

Code under the MIT licence, see `LICENSE`. Screenshots are captures of public pages, taken in my own browser, and are included as evidence.
