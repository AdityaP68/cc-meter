import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { facets, overview } from '../core/aggregate.js';
import { loadPricing } from '../core/pricing.js';
import { executeReview, getReview, latestReview, loadReviewConfig, prepareReview, reviewOverhead, storeConsent } from '../core/review.js';
import { recordSynthetic, SENTINEL_INPUT, SENTINEL_OUTPUT, SENTINEL_SECRET, syntheticLines } from './helpers/review.js';
import { makeStubClaude } from './helpers/stub-claude.js';

describe('review pipeline (stub claude)', () => {
  const table = loadPricing();
  let s: ReturnType<typeof recordSynthetic>;
  let stub: ReturnType<typeof makeStubClaude>;
  const env = (mode = 'ok') => {
    process.env.STUB_MODE = mode;
  };
  beforeEach(() => {
    s = recordSynthetic();
    stub = makeStubClaude();
    process.env.CCMETER_CLAUDE_BIN = stub.bin;
    process.env.STUB_LOG = stub.log;
    process.env.CLAUDE_CONFIG_DIR = s.claude;
    env();
  });
  afterEach(() => {
    for (const k of ['CCMETER_CLAUDE_BIN', 'STUB_LOG', 'CLAUDE_CONFIG_DIR', 'STUB_MODE']) delete process.env[k];
  });

  it('prepares without spending: digest, flags, exact payload, estimate, no cached review', () => {
    const p = prepareReview(s.db, s.sessionId, { table, model: 'claude-sonnet-5-5', home: s.home });
    expect(p.cached).toBeNull();
    expect(p.flags.map((f) => f.detector).sort()).toEqual(['compactions', 'retry_loops', 'tool_errors', 'user_corrections']);
    expect(p.input).toContain('<digest>');
    expect(p.estimate.costUsd).toBeGreaterThan(0);
    expect(stub.calls()).toHaveLength(0);
  });

  it('runs the judge once, stores the review keyed by (session, digest, rubric, model), and a repeat is free', async () => {
    const p = prepareReview(s.db, s.sessionId, { table, model: 'claude-haiku-5-5', home: s.home });
    const r = await executeReview(s.db, p, { table, home: s.home });
    expect(stub.calls()).toHaveLength(1);
    expect(stub.calls()[0]!.cwd).toContain(path.join(s.home, 'ccmeter-judge').replace(/^\/private/, ''));
    expect(r.stored.review.prompt_scores.map((x) => x.turn)).toEqual([1, 2, 3]);
    expect(r.stored.costUsd).toBe(0.0123);

    const again = prepareReview(s.db, s.sessionId, { table, model: 'claude-haiku-5-5', home: s.home });
    expect(again.cached?.review).toEqual(r.stored.review);
    expect(again.digestHash).toBe(p.digestHash);
    // a different model, or a changed session, is a different key
    expect(prepareReview(s.db, s.sessionId, { table, model: 'claude-sonnet-5-5', home: s.home }).cached).toBeNull();
    expect(latestReview(s.db, s.sessionId)?.model).toBe('claude-haiku-5-5');
    expect(s.db.prepare('SELECT COUNT(*) n FROM reviews').get()).toEqual({ n: 1 });
  });

  it('records the judge run as a session tagged ccmeter-judge and keeps it out of usage totals', async () => {
    const before = overview(s.db);
    const p = prepareReview(s.db, s.sessionId, { table, model: 'claude-haiku-5-5', home: s.home });
    const r = await executeReview(s.db, p, { table, home: s.home });
    expect(r.judgeSessionRecorded).toBe(true);
    const judge = s.db.prepare("SELECT source, cost_usd FROM sessions WHERE source = 'ccmeter-judge'").all();
    expect(judge).toHaveLength(1);
    const after = overview(s.db);
    expect(after.sessions).toBe(before.sessions);
    expect(after.costUsd).toBeCloseTo(before.costUsd, 12);
    expect(after.bySource.map((x) => x.source)).toEqual(['claude-code']);
    expect(overview(s.db, { source: 'ccmeter-judge' }).sessions).toBe(1);
    const fx = facets(s.db);
    expect(fx.projects).not.toContain('ccmeter-judge');
    expect(fx.models).not.toContain('claude-haiku-5-5');
    expect(fx.sources).toContain('ccmeter-judge');
    const o = reviewOverhead(s.db);
    expect(o.reviews).toBe(1);
    expect(o.costUsd).toBeCloseTo(0.0123, 9);
    expect(o.judgeSessions).toBe(1);
    expect(o.judgeSessionsCostUsd).toBeGreaterThan(0);
  });

  it('stores the review but never transcript text: no prompt text, tool input/output or secret in the database file', async () => {
    env('quote');
    const p = prepareReview(s.db, s.sessionId, { table, model: 'claude-haiku-5-5', home: s.home });
    const r = await executeReview(s.db, p, { table, home: s.home });
    expect(r.quotesRemoved).toBeGreaterThan(0);
    s.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const bytes = fs.readFileSync(path.join(s.home, 'ccmeter.db'));
    for (const bad of [SENTINEL_INPUT, SENTINEL_OUTPUT, SENTINEL_SECRET, 'exponential backoff', 'Add a retry to the fetch client']) expect(bytes.includes(Buffer.from(bad)), bad).toBe(false);
    expect(bytes.includes(Buffer.from('Add retry handling to a client'))).toBe(true); // the judge's own words are stored
  });

  it('an invalid answer is not stored, but the paid run still counts as overhead', async () => {
    env('invalid');
    const p = prepareReview(s.db, s.sessionId, { table, model: 'claude-haiku-5-5', home: s.home });
    await expect(executeReview(s.db, p, { table, home: s.home })).rejects.toThrow(/failed validation/);
    expect(getReview(s.db, { sessionId: s.sessionId, digestHash: p.digestHash, rubricVersion: p.rubricVersion, model: p.model })).toBeNull();
    expect(reviewOverhead(s.db).judgeSessions).toBe(1);
  });

  it('a failed call stores nothing', async () => {
    env('error');
    const p = prepareReview(s.db, s.sessionId, { table, model: 'claude-haiku-5-5', home: s.home });
    await expect(executeReview(s.db, p, { table, home: s.home })).rejects.toThrow(/Not logged in/);
    expect(s.db.prepare('SELECT COUNT(*) n FROM reviews').get()).toEqual({ n: 0 });
  });

  it('config: default model, stored consent keeps other keys', () => {
    expect(loadReviewConfig(s.home)).toEqual({ model: 'claude-sonnet-5-5', consent: null });
    fs.writeFileSync(path.join(s.home, 'config.json'), JSON.stringify({ port: 7337, review: { model: 'claude-haiku-5-5' } }));
    storeConsent(s.home);
    const c = JSON.parse(fs.readFileSync(path.join(s.home, 'config.json'), 'utf8'));
    expect(c.port).toBe(7337);
    expect(c.review.model).toBe('claude-haiku-5-5');
    expect(loadReviewConfig(s.home).consent?.version).toBe(1);
    expect(loadReviewConfig(s.home).model).toBe('claude-haiku-5-5');
  });
});

describe('doctor and reviews', () => {
  it('reports the size of the stored review text', async () => {
    const { runDoctor } = await import('../core/doctor.js');
    const { saveReview } = await import('../core/review.js');
    const s = recordSynthetic();
    expect(runDoctor(s.db, loadPricing(), { skipExternal: true }).some((c) => c.id === 'reviews')).toBe(false);
    saveReview(s.db, { sessionId: s.sessionId, digestHash: 'h', rubricVersion: 'r1', model: 'm', review: { summary: { goal: 'g', outcome: 'unclear', decisions: [], open_issues: [] }, prompt_scores: [] }, inputTokens: 1, outputTokens: 1, costUsd: 0.01, createdAt: '2026-02-01T00:00:00Z' });
    const c = runDoctor(s.db, loadPricing(), { skipExternal: true }).find((x) => x.id === 'reviews');
    expect(c?.level).toBe('info');
    expect(c?.title).toMatch(/^1 stored review, \d+\.\d KB of review text/);
  });
});

describe('judge runs are tagged by where they ran', () => {
  it('a transcript whose cwd is the judge folder is recorded as ccmeter-judge by any route, hook-less included', async () => {
    const { judgeCwd } = await import('../core/review.js');
    const { SOURCE_JUDGE } = await import('../core/record.js');
    const lines = syntheticLines().map((l) => l.replaceAll('/work/proj', judgeCwd('/anywhere/.ccmeter')));
    const s = recordSynthetic(lines, 'judge-by-cwd-0001');
    expect(s.db.prepare('SELECT source FROM sessions WHERE session_id = ?').get(s.sessionId)).toEqual({ source: SOURCE_JUDGE });
    expect(overview(s.db).sessions).toBe(0);
    // an ordinary project folder that merely contains the word is not tagged
    const other = recordSynthetic(syntheticLines().map((l) => l.replaceAll('/work/proj', '/work/judge-notes')), 'plain-0001');
    expect(other.db.prepare('SELECT source FROM sessions WHERE session_id = ?').get(other.sessionId)).toEqual({ source: 'claude-code' });
  });
});
