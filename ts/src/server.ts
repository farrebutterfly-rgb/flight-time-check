#!/usr/bin/env node
/**
 * MCP server over stdio with the guard in front of the flight search.
 *
 *   npm run build && npm start
 *
 * The upstream is the recording in ../data/log.jsonl, because I have no access
 * to the real tool. Replace recordedSearch with a client for the real tool.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkLeg, type Leg } from "./contract.js";
import { guard } from "./guard.js";

const here = dirname(fileURLToPath(import.meta.url));
const LOG = join(here, "..", "..", "..", "data", "log.jsonl");

interface LogRow {
  from: string;
  to: string;
  web: [string, string, string, string][];
}

function minutes(text: string): number {
  const h = /(\d+)\s*h/.exec(text);
  const m = /(\d+)\s*m/.exec(text);
  return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
}

export function recordedSearch(origin: string, destination: string, logPath = LOG): Leg[] {
  const rows: LogRow[] = readFileSync(logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const row = rows.find((r) => r.from === origin.toUpperCase() && r.to === destination.toUpperCase() && r.web.length);
  if (!row) throw new Error(`${origin}-${destination} was not recorded`);
  return row.web.map(([dep, arr, dur, fare]) => ({
    dep: { iata: row.from, time: `2026-12-15T${dep}:00Z` },
    arr: { iata: row.to, time: `2026-12-${arr.includes("+1") ? 16 : 15}T${arr.replace("+1", "")}:00Z` },
    durationMinutes: minutes(dur),
    fare,
  }));
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "flight-time-guard", version: "1.0.0" });

  server.registerTool(
    "search_flights",
    {
      title: "Search flights",
      description:
        "One-way nonstop flights between two airports (IATA codes). Every dep.time and arr.time is the local clock time at that airport and carries the airport's UTC offset. Show the clock digits as they are. Do not convert them.",
      inputSchema: { origin: z.string().length(3), destination: z.string().length(3), date: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ origin, destination }) => {
      let body: unknown;
      try {
        body = guard(recordedSearch(origin, destination));
      } catch (e) {
        body = { flights: [], held: [], error: (e as Error).message };
      }
      return { content: [{ type: "text", text: JSON.stringify(body, null, 1) }] };
    },
  );

  server.registerTool(
    "check_flights",
    {
      title: "Check flights",
      description: "Check a list of flights against the time contract. Returns the violations per flight.",
      inputSchema: { flights: z.array(z.any()) },
      annotations: { readOnlyHint: true },
    },
    async ({ flights }) => {
      const report = (flights as Leg[]).map((f) => ({ route: `${f.dep.iata}-${f.arr.iata}`, violations: checkLeg(f) }));
      const body = { checked: report.length, failing: report.filter((r) => r.violations.length).length, report };
      return { content: [{ type: "text", text: JSON.stringify(body, null, 1) }] };
    },
  );
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await buildServer().connect(new StdioServerTransport());
}
