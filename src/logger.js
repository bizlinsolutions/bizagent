/**
 * Request logging and metrics for the bizagent dashboard.
 *
 * Each chat request is appended as a JSON line to <dataDir>/logs.jsonl.
 * Metrics are derived by scanning the log file. This is intentionally simple
 * and append-only — fine for a local single-user dashboard.
 */

import {
  mkdirSync,
  appendFileSync,
  readFileSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

function dataDir() {
  return process.env.BIZAGENT_DATA_DIR || join(homedir(), ".bizagent");
}

function logPath() {
  return join(dataDir(), "logs.jsonl");
}

function nowIso() {
  return new Date().toISOString();
}

/** Append a single log entry. */
export function logRequest(entry) {
  mkdirSync(dirname(logPath()), { recursive: true });
  const line = JSON.stringify({
    ts: nowIso(),
    ...entry,
  });
  appendFileSync(logPath(), line + "\n");
}

function readAll() {
  if (!existsSync(logPath())) return [];
  const raw = readFileSync(logPath(), "utf8");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Compute aggregate metrics from the log file.
 * @param {number} limit  max recent entries to return alongside aggregates
 */
export function getMetrics(limit = 50) {
  const all = readAll();
  const total = all.length;
  const ok = all.filter((e) => e.status === "ok").length;
  const errors = all.filter((e) => e.status === "error").length;
  const offline = all.filter((e) => e.mode === "offline").length;
  const online = all.filter((e) => e.mode === "online").length;
  const latencies = all
    .filter((e) => typeof e.durationMs === "number")
    .map((e) => e.durationMs);
  const avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;
  const p95Latency = latencies.length > 0
    ? Math.round(latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)])
    : 0;

  // requests per day for the last 14 days
  const byDay = {};
  for (const e of all) {
    const day = (e.ts || "").slice(0, 10);
    if (!day) continue;
    byDay[day] = (byDay[day] || 0) + 1;
  }
  const days = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, count: byDay[key] || 0 });
  }

  // errors per day (last 14)
  const errorsByDay = {};
  for (const e of all) {
    if (e.status !== "error") continue;
    const day = (e.ts || "").slice(0, 10);
    if (!day) continue;
    errorsByDay[day] = (errorsByDay[day] || 0) + 1;
  }
  const errorDays = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    errorDays.push({ day: key, count: errorsByDay[key] || 0 });
  }

  const recent = all.slice(-limit).reverse();

  return {
    total,
    ok,
    errors,
    offline,
    online,
    avgLatency,
    p95Latency,
    byDay: days,
    errorsByDay: errorDays,
    recent,
  };
}

/** Clear all logs. */
export function clearLogs() {
  writeFileSync(logPath(), "");
  return true;
}
