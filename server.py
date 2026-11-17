"""MCP server: the flight tool, with the guard in front of it.

    pip install mcp
    python3 server.py                 # stdio, for an MCP client

Tools
    search_flights(origin, destination, date)   flights with true time fields
    check_flights(flights)                      run the contract on any response

The upstream here is the recording in data/log.jsonl, because I have no access
to the real tool. Swap RecordedUpstream for the real client to use it for real.
"""
from mcp.server.fastmcp import FastMCP

from contract import check_leg
from guard import guard
from upstream import RecordedUpstream

mcp = FastMCP("flight-time-guard")
_upstream = RecordedUpstream()


@mcp.tool()
def search_flights(origin: str, destination: str, date: str = "2026-12-15") -> dict:
    """One-way nonstop flights between two airports (IATA codes).

    Every dep.time and arr.time is the local clock time at that airport and carries
    the airport's UTC offset, for example 2026-12-15T22:15:00+01:00. Show the clock
    digits as they are. Do not convert them.
    """
    try:
        raw = _upstream.search(origin, destination, date)
    except LookupError as e:
        return {"flights": [], "held": [], "error": str(e)}
    return guard(raw)


@mcp.tool()
def check_flights(flights: list[dict]) -> dict:
    """Check a list of flights against the time contract. Returns the violations per flight."""
    report = [{"route": f"{f['dep']['iata']}-{f['arr']['iata']}", "violations": check_leg(f)} for f in flights]
    return {"checked": len(report), "failing": sum(bool(r["violations"]) for r in report), "report": report}


if __name__ == "__main__":
    mcp.run()
