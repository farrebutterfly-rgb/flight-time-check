"""Check a flight tool response against the time contract.

    python3 check.py examples/quoted_zrh_fco.json          # exit code 1 if a rule is broken
    python3 check.py --fix examples/quoted_zrh_fco.json    # print the same legs with the airport offset
    cat response.json | python3 check.py -

The file holds one leg or a list of legs:
    {"dep": {"iata": "ZRH", "time": "..."}, "arr": {"iata": "FCO", "time": "..."}, "durationMinutes": 90}
"""
import argparse
import json
import sys

from contract import check_leg, to_contract


def load(path):
    text = sys.stdin.read() if path == "-" else open(path, encoding="utf-8").read()
    data = json.loads(text)
    return data if isinstance(data, list) else [data]


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check flight legs against the time contract.")
    parser.add_argument("file", help="JSON file with one leg or a list of legs, or - for stdin")
    parser.add_argument("--fix", action="store_true", help="print the legs rewritten with the airport offset")
    args = parser.parse_args(argv)
    legs = load(args.file)
    if args.fix:
        print(json.dumps([to_contract(leg) for leg in legs], indent=1))
        return 0
    failing = 0
    for i, leg in enumerate(legs, 1):
        errors = check_leg(leg)
        route = f"{leg['dep']['iata']}-{leg['arr']['iata']}"
        if errors:
            failing += 1
            print(f"leg {i} {route}: FAIL")
            for e in errors:
                print("   ", e)
        else:
            print(f"leg {i} {route}: ok")
    print(f"{failing} of {len(legs)} legs break the contract")
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main())
