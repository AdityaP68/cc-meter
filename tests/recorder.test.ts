import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSession, listSessions, rollup } from '../core/aggregate.js';
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
  db = openDb(path.join(home, 'test.db'));
});
afterEach(() => {
  db.close();
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CCMETER_HOME;
  delete process.env.CCMETER_JUDGE_RUNNING;
});

const writeTranscript = (id: string, lines: string[]) => {
  const dir = path.join(claude, 'projects', '-p');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
};

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
