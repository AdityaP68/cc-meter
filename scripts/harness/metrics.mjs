#!/usr/bin/env node
// Measure how agent sessions on THIS project spend context, from ccmeter's own database (read-only).
// The context-harness method: measure first, then re-measure after changing the setup.
//   node scripts/harness/metrics.mjs [--project cc-meter] [--since 2026-10-01] [--json]
// Per main-thread request, context = input + cache_write + cache_read tokens (what the request re-sent).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const WINDOW = 200_000;

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);

/** rows: [{context, cost}] in request order for one session (main thread only). */
export function summarize(rows) {
  const ctx = rows.map((r) => r.context).sort((a, b) => a - b);
  const cost = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  const over = rows.filter((r) => r.context > WINDOW).reduce((s, r) => s + (r.cost ?? 0), 0);
  return { requests: rows.length, cost, medianContext: pct(ctx, 0.5), p90Context: pct(ctx, 0.9), maxContext: ctx.at(-1) ?? 0, costShareAbove200k: cost ? over / cost : 0 };
}

function main() {
  const argv = process.argv.slice(2);
  const get = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  const project = get('--project') ?? path.basename(ROOT);
  const since = get('--since') ?? '1970-01-01';
  const fresh = path.join(os.homedir(), '.ccmeter');
  const earlier = ['.agent-lens', '.sessionscope'].map((d) => path.join(os.homedir(), d)).find((d) => fs.existsSync(d));
  const home = process.env.CCMETER_HOME || process.env.AGENT_LENS_HOME || process.env.SESSIONSCOPE_HOME || (!fs.existsSync(fresh) && earlier) || fresh;
  const file = ['ccmeter.db', 'agent-lens.db', 'sessionscope.db'].map((n) => path.join(home, n)).find((f) => fs.existsSync(f)) ?? path.join(home, 'ccmeter.db');
  if (!fs.existsSync(file)) {
    console.error(`no ccmeter database at ${file}; install ccmeter or run \`ccmeter record --all\``);
    return 1;
  }
  const db = new DatabaseSync(file, { readOnly: true });
  const sessions = db.prepare('SELECT session_id, started_at, turns, cost_usd, sidechain_cost_usd FROM sessions WHERE project = ? AND started_at >= ? ORDER BY started_at').all(project, since);
  const q = db.prepare('SELECT input + cache_write + cache_read AS context, cost_usd AS cost FROM messages WHERE session_id = ? AND sidechain = 0 ORDER BY seq');
  const per = sessions.map((s) => ({ id: s.session_id.slice(0, 8), started: s.started_at, turns: s.turns, sessionCost: s.cost_usd, subagentCost: s.sidechain_cost_usd, ...summarize(q.all(s.session_id)) }));
  const all = summarize(sessions.flatMap((s) => q.all(s.session_id)));
  const out = { project, since, measuredAt: new Date().toISOString(), sessions: per.length, mainThread: all, totalCost: per.reduce((n, s) => n + s.sessionCost, 0), perSession: per };
  if (argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }
  const k = (n) => `${Math.round(n / 1000)}k`;
  console.log(`project ${project}: ${per.length} sessions, $${out.totalCost.toFixed(2)} total; main thread ${all.requests} requests, context median ${k(all.medianContext)} / p90 ${k(all.p90Context)} / max ${k(all.maxContext)}; ${(all.costShareAbove200k * 100).toFixed(0)}% of main-thread cost paid at >200k context`);
  for (const s of per) console.log(`  ${s.id} ${String(s.started).slice(0, 10)}  ${String(s.requests).padStart(5)} req  $${s.sessionCost.toFixed(2).padStart(7)}  median ${k(s.medianContext).padStart(5)}  max ${k(s.maxContext).padStart(5)}  >200k ${(s.costShareAbove200k * 100).toFixed(0).padStart(3)}%`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
