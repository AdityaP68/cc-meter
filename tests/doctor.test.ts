import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../core/db.js';
import { runDoctor, verifyPricing } from '../core/doctor.js';
import { loadPricing } from '../core/pricing.js';
import { recordTranscript } from '../core/record.js';
import { asst, installFixture, tmpDir } from './helpers/util.js';

const table = loadPricing({ overridePath: null });
let db: Db;
let claude: string;

beforeEach(() => {
  const home = tmpDir();
  claude = tmpDir('claude-');
  process.env.CLAUDE_CONFIG_DIR = claude;
  process.env.CCMETER_HOME = home;
  db = openDb(path.join(home, 't.db'));
});

const write = (id: string, lines: string[]) => {
  const dir = path.join(claude, 'projects', '-p');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(f, lines.join('\n'));
  return f;
};
const byId = (checks: ReturnType<typeof runDoctor>, id: string) => checks.find((c) => c.id === id)!;
const opts = { skipExternal: true, claudeVersion: '2.1.287', pluginList: 'ccmeter@ccmeter ✔ enabled' };

describe('doctor', () => {
  it('is healthy on verified fixtures', () => {
    recordTranscript(db, table, installFixture('cc-2.1.287/sdk-complete.jsonl', claude));
    const c = runDoctor(db, table, opts);
    expect(c.filter((x) => x.level === 'error' || x.level === 'warn')).toEqual([]);
    expect(byId(c, 'cc-version').level).toBe('ok');
    expect(byId(c, 'db').level).toBe('ok');
    expect(byId(c, 'hooks').level).toBe('ok');
  });

  it('warns about unpriced models by name', () => {
    recordTranscript(db, table, write('s1', [asst({ id: 'a', model: 'claude-mystery-9', input: 10 })]));
    const u = byId(runDoctor(db, table, opts), 'unpriced');
    expect(u.level).toBe('warn');
    expect(u.title).toContain('claude-mystery-9');
  });

  it('warns when the installed Claude Code is newer than any verified version, or has no parser', () => {
    expect(byId(runDoctor(db, table, { ...opts, claudeVersion: '2.1.900' }), 'cc-version').level).toBe('warn');
    expect(byId(runDoctor(db, table, { ...opts, claudeVersion: '3.0.0' }), 'cc-version').title).toContain('no matching parser');
    expect(byId(runDoctor(db, table, { ...opts, claudeVersion: '2.1.100' }), 'cc-version').level).toBe('warn');
  });

  it('flags sessions recorded with unverified versions', () => {
    const newer = asst({ id: 'a', input: 1 }).replace('"version":"2.1.287"', '"version":"2.1.950"');
    recordTranscript(db, table, write('s2', [newer]));
    expect(byId(runDoctor(db, table, opts), 'parser-status').level).toBe('warn');
  });

  it('surfaces unrecognized entry types and unknown usage fields', () => {
    const weird = [JSON.stringify({ type: 'hologram-entry', version: '2.1.287' }), asst({ id: 'a', input: 1, usageExtra: { audio_tokens: 3 } })];
    recordTranscript(db, table, write('s3', weird));
    const c = runDoctor(db, table, opts);
    expect(byId(c, 'unknown-types').level).toBe('warn');
    expect(byId(c, 'unknown-types').detail).toContain('hologram-entry');
    expect(byId(c, 'unknown-usage').detail).toContain('audio_tokens');
  });

  it('warns when hooks are not installed', () => {
    const c = runDoctor(db, table, { skipExternal: true, claudeVersion: '2.1.287', pluginList: '' });
    expect(byId(c, 'hooks').level).toBe('warn');
  });

  it('reports transcripts on disk that are not recorded yet', () => {
    write('unrecorded', [asst({ id: 'a', input: 1 })]);
    expect(byId(runDoctor(db, table, opts), 'coverage').title).toContain('1 transcripts are not recorded');
  });

  it("verifies the price table against Claude Code's own costUSD", () => {
    recordTranscript(db, table, installFixture('cc-2.1.286/sdk-complete.jsonl', claude));
    const rows = verifyPricing(db, table);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.consistent).toBe(r.pairs);
      expect(r.exactMaxAbsErrUsd).toBeLessThan(1e-6);
    }
  });
});
