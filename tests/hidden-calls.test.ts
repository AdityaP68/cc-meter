import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb } from '../core/db.js';
import { loadPricing, messageCost } from '../core/pricing.js';
import { recordTranscript } from '../core/record.js';
import { claudeCodePartial, hiddenCallsEstimate } from '../core/reconcile.js';
import { startServer, type RunningServer } from '../server/index.js';
import { asst, costStateLine, installFixture, tmpDir } from './helpers/util.js';

// docs/FORMATS.md, Known discrepancies 1-3: Claude Code can bill calls it never writes to the transcript. Where its
// cost-state covers the whole session (>= agent-lens's tokens in every model and class), the difference is shown as an
// estimate; where it covers less (a session resumed across processes), nothing is estimated.
const table = loadPricing({ overridePath: null });
type T = { input: number; output: number; cacheWrite: number; cacheRead: number };
const price = (model: string, t: T) => messageCost(table, { model, ...t, cacheWrite1h: t.cacheWrite, webSearch: 0, speed: null })!;
const ours = (model: string, t: T, unpriced = false) => ({ model, messages: 2, cost: unpriced ? 0 : price(model, t), unpriced, ...t });
const theirs = (model: string, t: T) => ({ inputTokens: t.input, outputTokens: t.output, cacheReadInputTokens: t.cacheRead, cacheCreationInputTokens: t.cacheWrite, thinkingTokens: 0, webSearchRequests: 0, costUSD: price(model, t) });
const cs = (usage: Record<string, ReturnType<typeof theirs>>) => ({ totalCostUSD: Object.values(usage).reduce((n, u) => n + u.costUSD, 0), modelUsage: usage, hasUnknownModelCost: false }) as never;

const S = 'claude-sonnet-5-5';
const H = 'claude-haiku-4-5';
const seen: T = { input: 200, output: 100, cacheWrite: 2000, cacheRead: 10_000 };
const billed: T = { input: 2224, output: 130, cacheWrite: 2000, cacheRead: 210_000 };
const haikuOnly: T = { input: 3000, output: 300, cacheWrite: 0, cacheRead: 0 };

describe('hiddenCallsEstimate', () => {
  it("is Claude Code's total minus agent-lens's when Claude Code counted at least as much in every class", () => {
    const e = hiddenCallsEstimate({ models: [ours(S, seen)], costState: cs({ [S]: theirs(S, billed), [H]: theirs(H, haikuOnly) }), partialMessages: 0 }, table);
    expect(e).not.toBeNull();
    expect(e!.usd).toBeCloseTo(price(S, billed) - price(S, seen) + price(H, haikuOnly), 9);
    expect(e!.claudeCodeUsd).toBeCloseTo(price(S, billed) + price(H, haikuOnly), 9);
    expect(e!.outputTokensExcluded).toBe(0);
    expect(e!.outputUsdExcluded).toBe(0);
  });

  it('is null without a cost-state entry, or when the tokens match exactly', () => {
    expect(hiddenCallsEstimate({ models: [ours(S, seen)], costState: null, partialMessages: 0 }, table)).toBeNull();
    expect(hiddenCallsEstimate({ models: [ours(S, seen)], costState: cs({ [S]: theirs(S, seen) }), partialMessages: 0 }, table)).toBeNull();
  });

  it('is null when Claude Code counted less in any class (record covers only part of a resumed session)', () => {
    const lessRead = { ...billed, cacheRead: seen.cacheRead - 1 };
    expect(hiddenCallsEstimate({ models: [ours(S, seen)], costState: cs({ [S]: theirs(S, lessRead) }), partialMessages: 0 }, table)).toBeNull();
    // a model the transcript has but Claude Code's record lacks
    expect(hiddenCallsEstimate({ models: [ours(S, seen), ours(H, haikuOnly)], costState: cs({ [S]: theirs(S, billed) }), partialMessages: 0 }, table)).toBeNull();
  });

  it('is null when a model with a difference is unpriced: the gap cannot be priced, and unpriced is never $0', () => {
    const m = 'claude-mystery-9';
    const e = hiddenCallsEstimate({ models: [ours(m, seen, true)], costState: cs({ [m]: { ...theirs(S, billed), costUSD: 1 } }), partialMessages: 0 }, table);
    expect(e).toBeNull();
  });

  it('leaves out the output difference when replies were saved mid-stream (that gap is item 1, not hidden calls)', () => {
    const e = hiddenCallsEstimate({ models: [ours(S, seen)], costState: cs({ [S]: theirs(S, billed) }), partialMessages: 3 }, table)!;
    const outputGap = billed.output - seen.output;
    expect(e.outputTokensExcluded).toBe(outputGap);
    expect(e.outputUsdExcluded).toBeCloseTo(price(S, { input: 0, output: outputGap, cacheWrite: 0, cacheRead: 0 }), 12);
    expect(e.usd).toBeCloseTo(price(S, billed) - price(S, seen) - price(S, { input: 0, output: outputGap, cacheWrite: 0, cacheRead: 0 }), 9);
    // a gap made only of output tokens in such a session is no estimate at all
    const onlyOutput = { ...seen, output: seen.output + 500 };
    expect(hiddenCallsEstimate({ models: [ours(S, seen)], costState: cs({ [S]: theirs(S, onlyOutput) }), partialMessages: 3 }, table)).toBeNull();
  });
});

describe('claudeCodePartial', () => {
  it("names the models Claude Code's record lacks and the classes where it counted fewer tokens", () => {
    // 2026-10-15 case: a session whose cost-state had no Sonnet entry and about half the Opus output and cache tokens.
    const O = 'claude-opus-5';
    const opus: T = { input: 400, output: 20_000, cacheWrite: 50_000, cacheRead: 900_000 };
    const half: T = { input: 400, output: 10_000, cacheWrite: 25_000, cacheRead: 450_000 };
    const p = claudeCodePartial({ models: [ours(S, seen), ours(O, opus)], costState: cs({ [O]: theirs(O, half) }) }, table);
    expect(p).toEqual({ missingModels: [S], fewerTokens: [{ model: O, classes: ['output', 'cacheWrite', 'cacheRead'] }] });
    expect(hiddenCallsEstimate({ models: [ours(S, seen), ours(O, opus)], costState: cs({ [O]: theirs(O, half) }), partialMessages: 0 }, table)).toBeNull();
  });

  it('is null without a cost-state entry, when tokens match, and when Claude Code counted at least as much everywhere', () => {
    expect(claudeCodePartial({ models: [ours(S, seen)], costState: null }, table)).toBeNull();
    expect(claudeCodePartial({ models: [ours(S, seen)], costState: cs({ [S]: theirs(S, seen) }) }, table)).toBeNull();
    // more tokens, and a model only Claude Code saw: hidden calls, not a partial record
    expect(claudeCodePartial({ models: [ours(S, seen)], costState: cs({ [S]: theirs(S, billed), [H]: theirs(H, haikuOnly) }) }, table)).toBeNull();
  });

  it('flags a single class short by one token', () => {
    const p = claudeCodePartial({ models: [ours(S, seen)], costState: cs({ [S]: theirs(S, { ...billed, cacheRead: seen.cacheRead - 1 }) }) }, table);
    expect(p).toEqual({ missingModels: [], fewerTokens: [{ model: S, classes: ['cacheRead'] }] });
  });
});

it('the dashboard shows the estimate to the cent, never finer', async () => {
  const { approxUsd } = await import('../dashboard/src/format.ts');
  expect([0.004, 0.108, 6.951, 1234.5].map(approxUsd)).toEqual(['< $0.01', '≈ $0.11', '≈ $6.95', '≈ $1,235']);
});

/* ---------- server API ---------- */
let srv: RunningServer;
function json(p: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: srv.port, path: p, headers: { Host: `127.0.0.1:${srv.port}` } }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

beforeAll(async () => {
  const claude = tmpDir('claude-');
  process.env.CLAUDE_CONFIG_DIR = claude;
  process.env.AGENT_LENS_HOME = tmpDir();
  const db = openDb(':memory:');
  const dir = path.join(claude, 'projects', '-proj-h');
  fs.mkdirSync(dir, { recursive: true });
  const msgs = [asst({ id: 'm1', input: 100, output: 50, cw: 1000, cw1h: 1000, cr: 5000 }), asst({ id: 'm2', input: 100, output: 50, cw: 1000, cw1h: 1000, cr: 5000 })];
  const write = (id: string, lines: string[]) => {
    fs.writeFileSync(path.join(dir, `${id}.jsonl`), lines.join('\n'));
    recordTranscript(db, table, path.join(dir, `${id}.jsonl`));
  };
  const u = (t: T, model = S) => ({ ...t, costUSD: price(model, t) });
  write('hidden-calls', [...msgs, costStateLine({ [S]: u(billed), [H]: u(haikuOnly, H) })]);
  write('resumed', [...msgs, costStateLine({ [S]: u({ input: 100, output: 50, cacheWrite: 1000, cacheRead: 5000 }) })]);
  recordTranscript(db, table, installFixture('cc-2.1.287/sdk-complete.jsonl', claude, '-proj-b'));
  srv = await startServer({ port: 0, db, table, staticDir: tmpDir('static-'), skipExternalChecks: true });
});
afterAll(async () => {
  await srv?.close();
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.AGENT_LENS_HOME;
});

describe('server: calls not in the transcript', () => {
  it('lists the estimate on session rows only where it is valid', async () => {
    const { rows } = await json('/api/sessions?limit=10');
    const by = (id: string) => rows.find((r: any) => r.sessionId === id);
    expect(rows).toHaveLength(3);
    expect(by('hidden-calls').hiddenCalls.usd).toBeCloseTo(price(S, billed) - price(S, seen) + price(H, haikuOnly), 9);
    expect(by('resumed').hiddenCalls).toBeNull();
    expect(by('resumed').claudeCodePartial).toEqual({ missingModels: [], fewerTokens: [{ model: S, classes: ['input', 'output', 'cacheWrite', 'cacheRead'] }] });
    expect(by('hidden-calls').claudeCodePartial).toBeNull();
    for (const r of rows.filter((x: any) => !['hidden-calls', 'resumed'].includes(x.sessionId))) expect(r.hiddenCalls).toBeNull();
  });

  it('never adds the estimate to agent-lens cost or totals', async () => {
    const { rows } = await json('/api/sessions?limit=10');
    const ov = await json('/api/overview');
    expect(rows.find((r: any) => r.sessionId === 'hidden-calls').costUsd).toBeCloseTo(price(S, seen), 9);
    expect(rows.reduce((n: number, s: any) => n + s.costUsd, 0)).toBeCloseTo(ov.costUsd, 9);
  });

  it('carries the estimate on the session detail', async () => {
    const d = await json('/api/sessions/hidden-calls');
    expect(d.session.hiddenCalls).toMatchObject({ outputTokensExcluded: 0 });
    expect(d.session.hiddenCalls.claudeCodeUsd).toBeCloseTo(price(S, billed) + price(H, haikuOnly), 9);
    const resumed = (await json('/api/sessions/resumed')).session;
    expect(resumed.hiddenCalls).toBeNull();
    expect(resumed.claudeCodePartial.fewerTokens).toHaveLength(1);
    expect(d.session.claudeCodePartial).toBeNull();
  });
});
