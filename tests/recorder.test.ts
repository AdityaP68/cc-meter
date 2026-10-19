import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSession, listSessions, overview, rollup } from '../core/aggregate.js';
import { openDb, type Db } from '../core/db.js';
import { loadPricing } from '../core/pricing.js';
import { recordAll, recordTranscript, RECORDER_VERSION } from '../core/record.js';
import { asst, installFixture, tmpDir, user } from './helpers/util.js';

const table = loadPricing({ overridePath: null });
let home: string;
let claude: string;
let db: Db;

beforeEach(() => {
  home = tmpDir();
  claude = tmpDir('claude-');
  process.env.CLAUDE_CONFIG_DIR = claude;
  process.env.CCMETER_HOME = home;
  delete process.env.CCMETER_JUDGE_RUNNING;
  delete process.env.SESSIONSCOPE_JUDGE_RUNNING;
  delete process.env.AGENT_LENS_JUDGE_RUNNING;
  db = openDb(path.join(home, 'test.db'));
});
afterEach(() => {
  db.close();
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CCMETER_HOME;
  delete process.env.CCMETER_JUDGE_RUNNING;
  delete process.env.SESSIONSCOPE_JUDGE_RUNNING;
  delete process.env.AGENT_LENS_JUDGE_RUNNING;
});

const writeTranscript = (id: string, lines: string[]) => {
  const dir = path.join(claude, 'projects', '-p');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
};

describe('overview', () => {
  it('counts what a session spent inside the window, like the daily chart (not by session start)', () => {
    writeTranscript('long', [
      user('a', '2026-01-01T00:00:01.000Z'), asst({ id: 'l1', input: 1000, output: 1000, ts: '2026-01-01T00:00:02.000Z' }),
      user('b', '2026-01-10T00:00:01.000Z'), asst({ id: 'l2', input: 3000, output: 3000, ts: '2026-01-10T00:00:02.000Z' }),
    ]);
    recordAll(db, table);
    const f = { since: '2026-01-05T00:00:00.000Z' };
    const o = overview(db, f);
    const days = rollup(db, 'day', f);
    expect(o.sessions).toBe(1);
    expect(o.totalTokens).toBe(6000);
    expect(o.costUsd).toBeCloseTo(days.reduce((n, d) => n + d.costUsd, 0), 10);
    expect(o.costUsd).toBeGreaterThan(0);
  });

  it('lists the same sessions the overview counts: active in the window, and using the model when filtered', () => {
    writeTranscript('long', [
      user('a', '2026-01-01T00:00:01.000Z'), asst({ id: 'l1', input: 1000, output: 1000, ts: '2026-01-01T00:00:02.000Z' }),
      user('b', '2026-01-10T00:00:01.000Z'), asst({ id: 'l2', model: 'claude-haiku-4-5', input: 3000, output: 3000, ts: '2026-01-10T00:00:02.000Z' }),
    ]);
    writeTranscript('old', [user('a', '2026-01-02T00:00:01.000Z'), asst({ id: 'o1', input: 10, output: 10, ts: '2026-01-02T00:00:02.000Z' })]);
    recordAll(db, table);
    const ids = (f: Parameters<typeof listSessions>[1]) => listSessions(db, f).rows.map((r) => r.sessionId).sort();
    const since = '2026-01-05T00:00:00.000Z';
    // started before the window, active inside it
    expect(ids({ since })).toEqual(['long']);
    expect(listSessions(db, { since }).total).toBe(overview(db, { since }).sessions);
    // the model used inside the window, not merely somewhere in the session
    expect(ids({ since, model: 'claude-haiku-4-5' })).toEqual(['long']);
    expect(ids({ since, model: 'claude-sonnet-5-5' })).toEqual([]);
    expect(overview(db, { since, model: 'claude-sonnet-5-5' }).sessions).toBe(0);
    expect(ids({ until: since })).toEqual(['long', 'old']);
  });
});

describe('session label', () => {
  it('uses the Claude Code title when there is one, else a label from entry point, model and turns (never prompt text)', () => {
    const prompt = 'please refactor the billing module SECRET-PROMPT-TEXT';
    const ep = { entrypoint: 'sdk-cli' };
    writeTranscript('untitled', [user(prompt, '2026-01-01T00:00:01.000Z', ep), asst({ id: 'a1', input: 1, output: 2, ts: '2026-01-01T00:00:02.000Z' })]);
    writeTranscript('titled', [
      user(prompt, '2026-01-01T00:00:01.000Z', { entrypoint: 'claude-desktop' }),
      asst({ id: 'b1', input: 1, output: 2, ts: '2026-01-01T00:00:02.000Z' }),
      JSON.stringify({ type: 'ai-title', aiTitle: 'Refactor billing', sessionId: 's1' }),
    ]);
    recordAll(db, table);
    const u = getSession(db, 'untitled')!.session;
    expect(u.title).toBeNull();
    expect(u.entrypoint).toBe('sdk-cli');
    expect(u.label).toMatch(/^headless run · [a-z0-9-]+ · 1 turn$/);
    expect(u.label).not.toContain('SECRET');
    const t = listSessions(db).rows.find((r) => r.sessionId === 'titled')!;
    expect(t.label).toBe('Refactor billing');
  });
});

describe('recorder', () => {
  it('records a session and is idempotent: a second run is a no-op, force gives identical rows', () => {
    const f = installFixture('cc-2.1.287/sdk-complete.jsonl', claude);
    const a = recordTranscript(db, table, f);
    expect(a.status).toBe('recorded');
    const snap = () => JSON.stringify([db.prepare('SELECT * FROM messages ORDER BY msg_id').all(), (db.prepare('SELECT input_tokens,output_tokens,cost_usd FROM sessions').all())]);
    const before = snap();
    expect(recordTranscript(db, table, f).status).toBe('unchanged');
    expect(recordTranscript(db, table, f, { force: true }).status).toBe('recorded');
    expect(snap()).toBe(before);
    expect((db.prepare('SELECT COUNT(*) c FROM sessions').get() as any).c).toBe(1);
  });

  it('is safe to run on both Stop and SessionEnd, and on a resumed session that has grown', () => {
    const lines = [user('hi', '2026-01-01T00:00:01.000Z'), asst({ id: 'm1', input: 10, output: 20, ts: '2026-01-01T00:00:02.000Z' })];
    const f = writeTranscript('sess-1', lines);
    recordTranscript(db, table, f); // Stop
    recordTranscript(db, table, f); // SessionEnd (unchanged)
    expect(getSession(db, 'sess-1')!.session.outputTokens).toBe(20);

    // resume: more turns appended to the same transcript, including a streaming duplicate of m1 with final usage
    fs.appendFileSync(f, [user('again', '2026-01-02T00:00:01.000Z'), asst({ id: 'm1', input: 10, output: 25, ts: '2026-01-01T00:00:02.000Z' }), asst({ id: 'm2', input: 1, output: 2, ts: '2026-01-02T00:00:02.000Z' })].join('\n') + '\n');
    expect(recordTranscript(db, table, f).status).toBe('recorded');
    const s = getSession(db, 'sess-1')!.session;
    expect(s.outputTokens).toBe(27); // m1 final (25) + m2 (2), not double counted
    expect(s.turns).toBe(2);
    expect(s.messages).toBe(2);
    expect((db.prepare('SELECT COUNT(*) c FROM sessions').get() as any).c).toBe(1);
    expect((db.prepare('SELECT COUNT(*) c FROM messages').get() as any).c).toBe(2);
  });

  it('re-records when the price table changes', () => {
    const f = writeTranscript('sess-2', [asst({ id: 'm1', model: 'claude-mystery-9', input: 1_000_000 })]);
    recordTranscript(db, table, f);
    expect(getSession(db, 'sess-2')!.session.unpricedModels).toEqual(['claude-mystery-9']);
    const override = path.join(home, 'pricing.json');
    fs.writeFileSync(override, JSON.stringify({ models: { 'claude-mystery-9': { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 } } }));
    const t2 = loadPricing({ overridePath: override });
    expect(recordTranscript(db, t2, f).status).toBe('recorded');
    const s = getSession(db, 'sess-2')!.session;
    expect(s.unpricedModels).toEqual([]);
    expect(s.costUsd).toBeCloseTo(3, 9);
  });

  it('stores unpriced messages with NULL cost, not zero', () => {
    const f = writeTranscript('sess-3', [asst({ id: 'm1', model: 'claude-mystery-9', input: 5 }), asst({ id: 'm2', input: 5 })]);
    recordTranscript(db, table, f);
    const rows = db.prepare('SELECT msg_id, cost_usd, priced FROM messages ORDER BY msg_id').all() as any[];
    expect(rows[0]).toMatchObject({ msg_id: 'm1', cost_usd: null, priced: 0 });
    expect(rows[1].priced).toBe(1);
    expect(rows[1].cost_usd).toBeGreaterThan(0);
  });

  it('tags sessions started by the ccmeter judge, and the tag is sticky', () => {
    const f = writeTranscript('judge-1', [asst({ id: 'm1', output: 1 })]);
    process.env.CCMETER_JUDGE_RUNNING = '1';
    recordTranscript(db, table, f);
    delete process.env.CCMETER_JUDGE_RUNNING;
    fs.appendFileSync(f, asst({ id: 'm2', output: 1 }) + '\n');
    recordTranscript(db, table, f); // later hook without the env var must not reset the source
    expect(getSession(db, 'judge-1')!.session.source).toBe('ccmeter-judge');
    const g = writeTranscript('normal-1', [asst({ id: 'n1', output: 1 })]);
    recordTranscript(db, table, g);
    expect(getSession(db, 'normal-1')!.session.source).toBe('claude-code');
    expect(listSessions(db, { source: 'ccmeter-judge' }).total).toBe(1);
  });

  it.each([
    ['SESSIONSCOPE_JUDGE_RUNNING', 'sessionscope-judge'],
    ['AGENT_LENS_JUDGE_RUNNING', 'agent-lens-judge'],
  ])('still treats the judge variable %s and the stored tag %s from earlier names as a judge run', (envVar, oldTag) => {
    const f = writeTranscript('judge-legacy', [asst({ id: 'm1', output: 1 })]);
    process.env[envVar] = '1';
    recordTranscript(db, table, f);
    delete process.env[envVar];
    expect(getSession(db, 'judge-legacy')!.session.source).toBe('ccmeter-judge');
    db.prepare('UPDATE sessions SET source = ? WHERE session_id = ?').run(oldTag, 'judge-legacy');
    fs.appendFileSync(f, asst({ id: 'm2', output: 1 }) + '\n');
    recordTranscript(db, table, f);
    expect(getSession(db, 'judge-legacy')!.session.source).toBe('ccmeter-judge');
  });

  it('skips transcripts with no assistant messages and reports missing files', () => {
    const f = writeTranscript('empty-1', [user('hello')]);
    expect(recordTranscript(db, table, f).status).toBe('empty');
    expect(recordTranscript(db, table, path.join(claude, 'nope.jsonl')).status).toBe('missing');
  });

  it('includes subagent transcripts in the session totals and tags them', () => {
    const f = installFixture('cc-2.1.28x/with-subagents/sess-subagents.jsonl', claude);
    recordTranscript(db, table, f);
    const s = getSession(db, 'sess-subagents')!.session;
    expect(s.sidechainMessages).toBeGreaterThan(0);
    expect(s.messages).toBeGreaterThan(s.sidechainMessages);
    const sidechain = (db.prepare('SELECT COUNT(*) c FROM messages WHERE sidechain = 1').get() as any).c;
    expect(sidechain).toBe(s.sidechainMessages);
  });

  it('writes model-switch and compaction events and a per-turn timeline', () => {
    const f = installFixture('cc-2.1.28x/multi-model-compaction.jsonl', claude);
    recordTranscript(db, table, f);
    const d = getSession(db, 'multi-model-compaction')!;
    expect(d.events.filter((e) => e.kind === 'model_switch')).toHaveLength(1);
    expect(d.events.filter((e) => e.kind === 'compaction').length).toBeGreaterThanOrEqual(3);
    expect(d.turns.reduce((n, t) => n + t.messages, 0)).toBe(d.session.messages);
    expect(d.turns.reduce((n, t) => n + t.costUsd, 0)).toBeCloseTo(d.session.costUsd, 6);
  });

  it('backfills a whole ~/.claude/projects tree and rolls up by day, project and model', () => {
    installFixture('cc-2.1.286/sdk-complete.jsonl', claude, '-proj-a', 'sess-a.jsonl');
    installFixture('cc-2.1.287/sdk-complete.jsonl', claude, '-proj-b', 'sess-b.jsonl');
    const r = recordAll(db, table);
    expect(r).toMatchObject({ total: 2, recorded: 2, errors: [] });
    expect(recordAll(db, table).unchanged).toBe(2);
    const total = listSessions(db).rows.reduce((n, s) => n + s.costUsd, 0);
    for (const by of ['day', 'project', 'model'] as const) expect(rollup(db, by).reduce((n, r) => n + r.costUsd, 0)).toBeCloseTo(total, 6);
  });

  it('keeps a recorder version so logic changes can force recomputation', () => {
    expect(RECORDER_VERSION).toBeGreaterThan(0);
    const f = writeTranscript('v-1', [asst({ id: 'm1', output: 1 })]);
    recordTranscript(db, table, f);
    db.exec('UPDATE sessions SET recorder_version = 0');
    expect(recordTranscript(db, table, f).status).toBe('recorded');
  });
});
