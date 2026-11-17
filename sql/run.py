"""Load the test into SQLite and run the BI queries in queries.sql.

    python3 sql/run.py               # in-memory, prints every query
    python3 sql/run.py out.sqlite    # also keeps the database file

Standard library only. The same schema loads into Postgres or DuckDB unchanged.
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HERE = Path(__file__).resolve().parent
FORMAT = {"A": "z", "C": "z", "B": "offset", "D": "offset", "E": "stopgap"}


def sek(text):
    digits = "".join(c for c in str(text) if c.isdigit())
    return int(digits) if digits else None


def load(db):
    db.executescript((HERE / "schema.sql").read_text(encoding="utf-8"))
    results = json.loads((ROOT / "data" / "results.json").read_text(encoding="utf-8"))
    for r in results:
        db.execute("INSERT INTO search VALUES (?,?,?,?,?,?,?)",
                   (r["n"], r["frm"], r["to"], r.get("zone"), r["cls"], int(r["n"] <= 22), r.get("note")))
        for f in r.get("rows", []):
            web = f["web"]
            db.execute("INSERT INTO flight VALUES (?,?,?,?,?,?,?,?,?,?)",
                       (r["n"], f["fn"], f["dep"], f["arr"], web[0] if web else None, web[1] if web else None,
                        f["sd"], f["sa"], sek(f["fare"]), sek(web[3]) if web else None))
    for run in json.loads((ROOT / "data" / "repeat.json").read_text(encoding="utf-8"))["runs"]:
        wall = run["wall_ms"] / 1000 if run["wall_ms"] else None
        db.execute("INSERT INTO repeat_run VALUES (?,?,?)", (run["run"], run["result"], wall))
    for arm, body in json.loads((ROOT / "data" / "ab.json").read_text(encoding="utf-8"))["arms"].items():
        for i, t in enumerate(body["trials"], 1):
            db.execute("INSERT INTO ab_trial VALUES (?,?,?,?,?)",
                       (arm, FORMAT[arm], body.get("route", ""), i, int(bool(t["right"]))))
    db.commit()


def queries():
    text = (HERE / "queries.sql").read_text(encoding="utf-8")
    for block in re.split(r"^-- name: ", text, flags=re.M)[1:]:
        name, _, sql = block.partition("\n")
        yield name.strip(), sql.strip()


def run_all(db):
    out = {}
    for name, sql in queries():
        cur = db.execute(sql)
        out[name] = ([d[0] for d in cur.description], cur.fetchall())
    return out


def main(argv):
    db = sqlite3.connect(argv[0] if argv else ":memory:")
    load(db)
    for name, (cols, rows) in run_all(db).items():
        print(f"\n{name}")
        print("  " + " | ".join(cols))
        for row in rows:
            print("  " + " | ".join("" if v is None else str(v) for v in row))


if __name__ == "__main__":
    main(sys.argv[1:])
