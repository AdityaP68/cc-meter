import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { listSessions } from './aggregate.js';
import { LATEST_SCHEMA, schemaVersion, type Db } from './db.js';
import { ccmeterHome, claudeHome, dbPath } from './paths.js';
import { PARSERS, cmpVersion } from './parser/index.js';
import { lookupPrice, type PriceTable } from './pricing.js';
import { listTranscripts, parseSession, transcriptSignature } from './record.js';
import { claudeCodeFigures, reconcile } from './reconcile.js';
import type { ParseStats } from './parser/types.js';

export type Level = 'ok' | 'info' | 'warn' | 'error';

export interface Check {
  id: string;
  level: Level;
  title: string;
  detail?: string;
}

export interface DoctorOptions {
  /** Skip checks that spawn `claude` (tests). */
  skipExternal?: boolean;
  /** Inject for tests. */
  claudeVersion?: string | null;
  pluginList?: string | null;
}

function tryExec(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const verifiedSpan = () => {
  const lo = PARSERS.map((p) => p.verifiedRange[0]).sort(cmpVersion)[0]!;
  const hi = PARSERS.map((p) => p.verifiedRange[1]).sort(cmpVersion).at(-1)!;
  return { lo, hi };
};

export function runDoctor(db: Db, table: PriceTable, opts: DoctorOptions = {}): Check[] {
  const checks: Check[] = [];
  const add = (id: string, level: Level, title: string, detail?: string) => checks.push({ id, level, title, detail });

  // 1. runtime
  const [maj = 0, min = 0] = process.versions.node.split('.').map(Number);
  add(
    'node',
    maj > 22 || (maj === 22 && min >= 13) ? 'ok' : 'error',
    `Node ${process.versions.node} (needs >= 22.13 for node:sqlite)`,
  );

  // 2. database health
  let sessionCount = 0;
  try {
    const integ = (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    const v = schemaVersion(db);
    sessionCount = (db.prepare('SELECT COUNT(*) c FROM sessions').get() as { c: number }).c;
    add('db', integ === 'ok' && v === LATEST_SCHEMA ? 'ok' : 'error', `Database ${dbPath()}: integrity ${integ}, schema v${v}/${LATEST_SCHEMA}, ${sessionCount} sessions`);
  } catch (e) {
    add('db', 'error', 'Database unreadable', String(e));
  }

  // 3. Claude Code version vs known parsers
  const { lo, hi } = verifiedSpan();
  const cc = opts.claudeVersion !== undefined ? opts.claudeVersion : opts.skipExternal ? null : tryExec('claude', ['--version']);
  const ccVer = cc?.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
  if (opts.skipExternal && opts.claudeVersion === undefined) add('cc-version', 'info', 'Claude Code version check skipped');
  else if (!ccVer) add('cc-version', 'warn', '`claude` not found on PATH (cannot check the installed version)');
  else if (!PARSERS.some((p) => p.handles(ccVer))) add('cc-version', 'warn', `Claude Code ${ccVer} has no matching parser; using the newest with unverified results`, `Verified range: ${lo}..${hi}`);
  else if (cmpVersion(ccVer, hi) > 0) add('cc-version', 'warn', `Claude Code ${ccVer} is newer than the newest version verified (${hi})`, 'Recording continues, but check the unrecognized-shape counts below. See docs/FORMATS.md to re-verify.');
  else if (cmpVersion(ccVer, lo) < 0) add('cc-version', 'warn', `Claude Code ${ccVer} is older than the oldest version verified (${lo})`);
  else add('cc-version', 'ok', `Claude Code ${ccVer} is within the verified range (${lo}..${hi})`);

  // 3b. versions found in recorded sessions
  const statusCounts = db.prepare("SELECT parser_status s, COUNT(*) c FROM sessions GROUP BY parser_status").all() as { s: string; c: number }[];
  const bad = statusCounts.filter((r) => r.s && r.s !== 'verified');
  if (bad.length) {
    const vers = new Set<string>();
    for (const r of db.prepare("SELECT cc_versions v FROM sessions WHERE parser_status != 'verified'").all() as { v: string }[])
      for (const x of JSON.parse(r.v) as string[]) vers.add(x);
    add('parser-status', 'warn', `${bad.reduce((n, r) => n + r.c, 0)} sessions were recorded with a Claude Code version outside the verified range`, `${bad.map((r) => `${r.s}: ${r.c}`).join(', ')}; versions: ${[...vers].sort(cmpVersion).join(', ')}`);
  } else if (sessionCount) add('parser-status', 'ok', 'All recorded sessions used a verified parser');

  // 4. unrecognized entry shapes
  const unknownTypes: Record<string, number> = {};
  const unknownUsage: Record<string, number> = {};
  let unparsable = 0;
  let noUsage = 0;
  for (const r of db.prepare('SELECT parse_stats p FROM sessions WHERE parse_stats IS NOT NULL').all() as { p: string }[]) {
    const s = JSON.parse(r.p) as ParseStats;
    unparsable += s.unparsable;
    noUsage += s.assistantWithoutUsage;
    for (const [k, n] of Object.entries(s.unknownTypes)) unknownTypes[k] = (unknownTypes[k] ?? 0) + n;
    for (const [k, n] of Object.entries(s.unknownUsageKeys)) unknownUsage[k] = (unknownUsage[k] ?? 0) + n;
  }
  const fmt = (m: Record<string, number>) => Object.entries(m).map(([k, n]) => `${k}×${n}`).join(', ');
  if (Object.keys(unknownTypes).length) add('unknown-types', 'warn', 'Unrecognized transcript entry types (skipped, not fatal)', fmt(unknownTypes));
  else add('unknown-types', 'ok', 'No unrecognized transcript entry types');
  if (Object.keys(unknownUsage).length) add('unknown-usage', 'warn', 'Unrecognized usage fields: a new billable token class may be going uncounted', fmt(unknownUsage));
  if (unparsable) add('unparsable', 'warn', `${unparsable} transcript lines were not valid JSON and were skipped`);
  if (noUsage) add('no-usage', 'info', `${noUsage} assistant entries had no usage object and were skipped`);

  const partial = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(partial_messages),0) m FROM sessions WHERE partial_messages > 0').get() as { n: number; m: number };
  if (partial.n)
    add('partial-usage', 'info', `${partial.n} sessions contain ${partial.m} messages with unfinalized usage (output tokens are a lower bound, so cost is slightly understated)`, 'Seen in subagent transcripts. Claude Code\'s own total, where recorded, is shown by `ccmeter report --session <id>`. See docs/FORMATS.md.');

  // 5. unpriced models
  const unpriced = db.prepare('SELECT model, COUNT(*) n, SUM(input + output + cache_write + cache_read) tok FROM messages WHERE priced = 0 GROUP BY model ORDER BY tok DESC').all() as { model: string; n: number; tok: number }[];
  if (unpriced.length) {
    const figures = claudeCodeFigures(listSessions(db, { limit: 1_000_000 }).rows, unpriced.map((u) => u.model)).map((f) =>
      f.withFigure
        ? `Claude Code's figure for ${f.model}: $${f.costUsd.toFixed(2)} (in ${f.withFigure} of ${f.sessions} session(s); not included in ccmeter's totals)`
        : `Claude Code recorded no cost for ${f.model} in its ${f.sessions} session(s)`,
    );
    add('unpriced', 'warn', `Unpriced models (shown as "unpriced", never as $0): ${unpriced.map((u) => u.model).join(', ')}`, `${unpriced.map((u) => `${u.model}: ${u.n} messages / ${u.tok} tokens`).join('; ')}. ${figures.join('. ')}. Add a price to ~/.ccmeter/pricing.json (same shape as pricing.json).`);
  }
  else add('unpriced', 'ok', 'Every recorded model has a price');
  const listOnly = (db.prepare('SELECT DISTINCT model FROM messages WHERE priced = 1 ORDER BY model').all() as { model: string }[])
    .map((r) => r.model)
    .filter((m) => lookupPrice(table, m)?.price.basis === 'list');
  if (listOnly.length) {
    // The basis is a label in pricing.json; the evidence is whether Claude Code's own costs agree with the table.
    const evidence = new Map(verifyPricing(db, table).map((r) => [r.model, r]));
    const lines = listOnly.map((m) => {
      const e = evidence.get(m);
      if (!e || e.pairs === 0) return `${m}: list price, no Claude Code cost recorded to compare`;
      return `${m}: list price, matches Claude Code in ${e.consistent} of ${e.pairs} session(s)${e.consistent < e.pairs ? ` (largest miss $${e.maxOutsideUsd.toFixed(4)})` : ''}`;
    });
    const unchecked = listOnly.filter((m) => !evidence.get(m)?.pairs);
    const off = listOnly.filter((m) => { const e = evidence.get(m); return !!e && e.consistent < e.pairs; });
    add(
      'price-basis',
      off.length ? 'warn' : 'info',
      off.length
        ? `Claude Code's own cost disagrees with the list price for ${off.join(', ')}`
        : unchecked.length
          ? `No Claude Code cost to check the list price of ${unchecked.join(', ')}`
          : `List prices for ${listOnly.join(', ')} match Claude Code's own costs`,
      `${lines.join('; ')}. Only sessions where Claude Code wrote a cost-state entry can be compared. Details: \`ccmeter doctor --verify-pricing\`.`,
    );
  }
  if (table.rejected.length) add('pricing-override', 'warn', `Ignored entries in ~/.ccmeter/pricing.json: ${table.rejected.join(', ')}`, 'Each model needs finite, non-negative numbers for input, output, cacheRead, cacheWrite5m and cacheWrite1h. Those models stay unpriced (never $0) until fixed.');
  add('pricing', 'ok', `Pricing table ${table.version} (${table.hash}) from ${table.sources.join(' + ')}`);

  // 6. hook installation
  if (!opts.skipExternal || opts.pluginList !== undefined) {
    const list = opts.pluginList !== undefined ? opts.pluginList : tryExec('claude', ['plugin', 'list']);
    const inPlugin = !!list && /ccmeter/i.test(list) && !/ccmeter[^\n]*(disabled|✗)/i.test(list);
    let inSettings = false;
    try {
      inSettings = /ccmeter\s+record/.test(fs.readFileSync(path.join(claudeHome(), 'settings.json'), 'utf8'));
    } catch {
      /* no settings file */
    }
    if (inPlugin || inSettings) add('hooks', 'ok', `Recorder hooks installed (${inPlugin ? 'plugin ccmeter' : '~/.claude/settings.json'})`);
    else add('hooks', 'warn', 'Recorder hooks not found: new sessions will not be recorded automatically', 'Run ./install.sh, or `ccmeter record --all` to backfill manually.');
  }
  const cliPath = path.join(ccmeterHome(), 'cli-path');
  if (fs.existsSync(cliPath)) {
    const target = fs.readFileSync(cliPath, 'utf8').trim();
    add('cli-path', fs.existsSync(target) ? 'ok' : 'error', fs.existsSync(target) ? `Hook launcher target ${target}` : `Hook launcher points at a missing file: ${target}`, fs.existsSync(target) ? undefined : 'Re-run ./install.sh.');
  } else add('cli-path', 'info', 'No ~/.ccmeter/cli-path (hooks will rely on `ccmeter` being on PATH)');

  // 7. transcripts on disk that are not recorded yet
  try {
    const known = new Map((db.prepare('SELECT session_id id, transcript_sig sig FROM sessions').all() as { id: string; sig: string }[]).map((r) => [r.id, r.sig]));
    let missing = 0;
    let stale = 0;
    let noCalls = 0;
    for (const f of listTranscripts()) {
      const id = path.basename(f, '.jsonl');
      const sig = known.get(id);
      if (sig === undefined) {
        // The recorder skips transcripts without a real API call (only synthetic replies, aborted starts).
        if ((parseSession(f, table)?.messageCount ?? 0) === 0) noCalls++;
        else missing++;
      } else if (sig !== transcriptSignature(f)) stale++;
    }
    const parts = [
      missing ? `${missing} transcript${missing === 1 ? ' is' : 's are'} not recorded` : '',
      stale ? `${stale} transcript${stale === 1 ? ' is' : 's are'} out of date` : '',
    ].filter(Boolean);
    const skipped = noCalls ? `${noCalls} transcript${noCalls === 1 ? ' has' : 's have'} no API calls (nothing to record)` : '';
    if (parts.length) add('coverage', 'info', [parts.join(' and '), skipped].filter(Boolean).join('; '), 'Run `ccmeter record --all` to backfill.');
    else add('coverage', 'ok', `All transcripts with API calls are recorded${skipped ? `; ${skipped}` : ''}`);
  } catch {
    /* no projects dir */
  }

  // 8. cross-check against Claude Code's own accounting
  const { rows } = listSessions(db, { limit: 100000 });
  let pairs = 0;
  let matched = 0;
  let worst: { id: string; ours: number; theirs: number; gap: number } | null = null;
  for (const s of rows) {
    if (!s.costState) continue;
    for (const r of reconcile(s, table)) {
      if (!r.claudeCode) continue;
      pairs++;
      if (r.tokensMatch) matched++;
      else if (r.ccmeter.cost !== null) {
        const gap = Math.abs(r.ccmeter.cost - r.claudeCode.cost);
        if (!worst || gap > worst.gap) worst = { id: s.sessionId, ours: r.ccmeter.cost, theirs: r.claudeCode.cost, gap };
      }
    }
  }
  if (pairs) {
    const largest = worst ? ` Largest difference: session ${worst.id} (${r2(worst.ours, worst.theirs)}); see \`ccmeter report --session ${worst.id}\`.` : '';
    add(
      'reconcile',
      matched === pairs ? 'ok' : 'info',
      `Token totals equal Claude Code's own cost-state for ${matched} of ${pairs} (session, model) pairs`,
      matched === pairs ? undefined : `A difference means one side sees calls the other does not: Claude Code can bill calls it never writes as messages, and its cost entry covers only the last process of a session resumed several times (then ccmeter's total, from the whole transcript, is the larger and complete one). See docs/FORMATS.md.${largest}`,
    );
  }
  return checks;
}

const r2 = (ours: number, theirs: number): string => `ccmeter $${ours.toFixed(2)}, Claude Code $${theirs.toFixed(2)}`;

export interface PricingVerifyRow {
  model: string;
  basis: string;
  /** (session, model) pairs where Claude Code recorded a cost. */
  pairs: number;
  /** Pairs whose Claude Code cost lies inside the range our table predicts from Claude Code's own tokens. */
  consistent: number;
  /** Largest amount (USD) by which a Claude Code cost fell outside the predicted range. */
  maxOutsideUsd: number;
  /** Pairs whose token counts equal ccmeter's, and the largest |ccmeter cost - Claude Code cost| among them. */
  exactTokenPairs: number;
  exactMaxAbsErrUsd: number;
}

/**
 * Does our price table reproduce Claude Code's own costUSD? Two tests per (session, model):
 *  1. range test: feed Claude Code's own token counts through the table (writes at 5m..1h rates) and require
 *     Claude Code's cost to land inside that range (tolerance $0.005);
 *  2. exact test: where our token counts equal Claude Code's, our cost (which knows the real 5m/1h split) must match.
 */
export function verifyPricing(db: Db, table: PriceTable): PricingVerifyRow[] {
  const acc = new Map<string, PricingVerifyRow>();
  const blank = (model: string): PricingVerifyRow => ({ model, basis: lookupPrice(table, model)?.price.basis ?? 'list', pairs: 0, consistent: 0, maxOutsideUsd: 0, exactTokenPairs: 0, exactMaxAbsErrUsd: 0 });
  // Every priced model that was used, so a model without any Claude Code cost to compare shows up as such.
  for (const { model } of db.prepare('SELECT DISTINCT model FROM messages WHERE priced = 1').all() as { model: string }[]) acc.set(model, blank(model));
  const { rows } = listSessions(db, { limit: 100000 });
  for (const s of rows) {
    for (const r of reconcile(s, table)) {
      if (!r.claudeCode || !r.priceRange || r.claudeCode.cost <= 0) continue;
      const cur = acc.get(r.model) ?? blank(r.model);
      cur.pairs++;
      const outside = Math.max(r.priceRange.low - r.claudeCode.cost, r.claudeCode.cost - r.priceRange.high, 0);
      if (outside <= 0.005) cur.consistent++;
      cur.maxOutsideUsd = Math.max(cur.maxOutsideUsd, outside);
      if (r.tokensMatch && r.ccmeter.cost !== null) {
        cur.exactTokenPairs++;
        cur.exactMaxAbsErrUsd = Math.max(cur.exactMaxAbsErrUsd, Math.abs(r.ccmeter.cost - r.claudeCode.cost));
      }
      acc.set(r.model, cur);
    }
  }
  return [...acc.values()].sort((a, b) => b.pairs - a.pairs);
}
