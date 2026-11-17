import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { checkLeg, type Leg, toContract } from "../src/contract.js";
import { guard, guardFlight } from "../src/guard.js";
import { buildServer, recordedSearch } from "../src/server.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const leg = (f: string, d: string, t: string, a: string, m: number): Leg => ({
  dep: { iata: f, time: d },
  arr: { iata: t, time: a },
  durationMinutes: m,
});

test("the quoted same-zone leg breaks rule 1 only", () => {
  const e = checkLeg(leg("ZRH", "2026-12-15T07:10:00Z", "FCO", "2026-12-15T08:40:00Z", 90));
  assert.equal(e.length, 2);
  assert.match(e[0], /ZRH is at \+01:00/);
});

test("the quoted cross-zone leg breaks both rules", () => {
  const e = checkLeg(leg("ARN", "2026-12-15T07:00:00Z", "LGW", "2026-12-15T08:35:00Z", 155)).join("|");
  assert.match(e, /durationMinutes says 155/);
  assert.match(e, /ARN is at \+01:00/);
});

test("the fix keeps the digits and passes", () => {
  const f = toContract(leg("ARN", "2026-12-15T22:15:00Z", "GOT", "2026-12-15T23:15:00Z", 60));
  assert.equal(f.dep.time, "2026-12-15T22:15:00+01:00");
  assert.deepEqual(checkLeg(f), []);
});

test("summer time is +02:00 in Stockholm, half-hour zones work", () => {
  assert.equal(toContract(leg("ARN", "2027-07-15T21:55:00Z", "GOT", "2027-07-15T22:55:00Z", 60)).dep.time, "2027-07-15T21:55:00+02:00");
  const r = guardFlight(leg("DXB", "2026-12-15T04:00:00Z", "DEL", "2026-12-15T08:45:00Z", 195));
  assert.ok(r.flight?.arr.time.endsWith("+05:30"));
});

test("a wrong duration and an unknown airport are held with the reason", () => {
  assert.match(guardFlight(leg("ARN", "2026-12-15T22:15:00Z", "GOT", "2026-12-15T23:15:00Z", 90)).reason ?? "", /says 90/);
  assert.match(guardFlight(leg("XXX", "2026-12-15T22:15:00Z", "GOT", "2026-12-15T23:15:00Z", 60)).reason ?? "", /XXX/);
});

test("all 17 quoted legs fail today and pass through the guard", () => {
  const legs: Leg[] = JSON.parse(readFileSync(join(root, "examples", "quoted_all.json"), "utf8"));
  assert.equal(legs.filter((l) => checkLeg(l).length).length, 17);
  const g = guard(legs);
  assert.equal(g.flights.length, 17);
  assert.equal(g.held.length, 0);
});

test("same offsets as the Python classifier on all 211 recorded flights", () => {
  const results = JSON.parse(readFileSync(join(root, "data", "results.json"), "utf8"));
  let n = 0;
  for (const r of results) {
    if (!r.web?.length) continue;
    for (const f of recordedSearch(r.frm, r.to, join(root, "data", "log.jsonl"))) {
      const g = guardFlight(f);
      assert.ok(g.flight, g.reason ?? "");
      const want = (h: number) => `${h < 0 ? "-" : "+"}${String(Math.floor(Math.abs(h))).padStart(2, "0")}:${Math.abs(h) % 1 ? "30" : "00"}`;
      // A UTC+0 airport is already true with Z, so the guard passes it through unchanged.
      const ends = (t: string, h: number) => t.endsWith(want(h)) || (h === 0 && t.endsWith("Z"));
      assert.ok(ends(g.flight.dep.time, r.off_from), `${g.flight.dep.time} ${r.off_from}`);
      assert.ok(ends(g.flight.arr.time, r.off_to), `${g.flight.arr.time} ${r.off_to}`);
      n++;
    }
  }
  assert.equal(n, 211);
});

test("the MCP server lists both tools and returns true times", async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = buildServer();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ["check_flights", "search_flights"]);
  const res = await client.callTool({ name: "search_flights", arguments: { origin: "ARN", destination: "GOT" } });
  const body = JSON.parse((res.content as { text: string }[])[0].text);
  assert.ok(body.flights.some((f: Leg) => f.dep.time === "2026-12-15T22:15:00+01:00"));
  assert.ok(body.flights.every((f: Leg) => !f.dep.time.endsWith("Z")));
  await client.close();
});
