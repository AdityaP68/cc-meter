import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-ignore -- plain ESM scripts
import { currentContext, decide } from '../scripts/harness/context-guard.mjs';
// @ts-ignore
import { lines, nextSection } from '../scripts/harness/orientation.mjs';
// @ts-ignore
import { migrationHashes, scanText, structuralChecks } from '../scripts/harness/check.mjs';
// @ts-ignore
import { summarize } from '../scripts/harness/metrics.mjs';
import { ROOT, asst, tmpDir } from './helpers/util.js';

const fresh = () => ({ warnedBands: [] as number[], handoffForced: false });

describe('context guard', () => {
  it('stays silent below the warning level and resets state', () => {
    const r = decide('UserPromptSubmit', 150_000, { warnedBands: [1], handoffForced: true }, 180_000, 300_000);
    expect(r).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(r.state).toEqual(fresh());
  });
  it('warns once per 100k band on UserPromptSubmit', () => {
    const a = decide('UserPromptSubmit', 190_000, fresh(), 180_000, 300_000);
    expect(a.stdout).toContain('handoff');
    expect(decide('UserPromptSubmit', 195_000, a.state, 180_000, 300_000).stdout).toBe('');
    expect(decide('UserPromptSubmit', 210_000, a.state, 180_000, 300_000).stdout).toContain('~210k');
  });
  it('blocks stopping once per session above the hand-off level', () => {
    const a = decide('Stop', 320_000, fresh(), 180_000, 300_000);
    expect(a.code).toBe(2);
    expect(a.stderr).toContain('docs/handoff.md');
    expect(decide('Stop', 330_000, a.state, 180_000, 300_000).code).toBe(0);
  });
  it('reads the last main-thread request, skipping subagent and synthetic entries', () => {
    const f = path.join(tmpDir(), 't.jsonl');
    fs.writeFileSync(f, [asst({ id: 'a', input: 10, cw: 100, cr: 250_000 }), asst({ id: 'b', input: 1, cr: 999_999, sidechain: true }), asst({ id: 'c', model: '<synthetic>' })].join('\n') + '\n');
    expect(currentContext(f)).toBe(250_110);
    const empty = path.join(tmpDir(), 'e.jsonl');
    fs.writeFileSync(empty, '{"type":"user"}\n');
    expect(currentContext(empty)).toBeNull();
  });
});

describe('session orientation', () => {
  it("extracts and caps the handoff's Next section", () => {
    const doc = '# H\n\n## Where\nx\n\n## Next\n\n1. do a\n2. do b\n\n## Later\nnope\n';
    expect(nextSection(doc)).toBe('1. do a\n2. do b');
    expect(nextSection('# no next here')).toBeNull();
    expect(nextSection('## Next\n' + 'line\n'.repeat(2000), 100)).toContain('[... truncated');
  });
  it('produces orientation lines for this repository without throwing', () => {
    const out = lines().join('\n');
    expect(out).toContain('Here: ');
    expect(out).toContain('Claude Code on PATH');
  });
});

describe('repository checks', () => {
  it('detects personal data and secrets, and allows known-safe addresses', () => {
    const hits = (t: string) => scanText(t, 'someuser').map((h: { what: string }) => h.what);
    // built by concatenation so this file does not itself contain secret-shaped text (the pre-commit check scans it)
    expect(hits('see /Us' + 'ers/alice/project')).toContain('absolute macOS home path');
    expect(hits('mail bob' + '@company.io')).toContain('email address');
    expect(hits('key sk-' + 'ant-abcdefgh12345')).toContain('Anthropic API key');
    expect(hits('hello someuser')).toContain('local username "someuser"');
    expect(hits('Co-Authored-By: Claude <noreply@anthropic.com>; /Users/…/x; dev@example.com')).toEqual([]);
  });
  it('locks shipped migrations and passes on the current repository', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'core', 'migrations.lock.json'), 'utf8'));
    expect(migrationHashes()['1']).toBe(lock['1']);
    expect(migrationHashes('version: 1,\n    sql: `CHANGED`')['1']).not.toBe(lock['1']);
    expect(structuralChecks()).toEqual([]);
  });
});

describe('harness metrics', () => {
  it('summarizes context per request and the cost share above 200k', () => {
    const s = summarize([{ context: 100_000, cost: 1 }, { context: 250_000, cost: 3 }, { context: 300_000, cost: 0 }]);
    expect(s).toMatchObject({ requests: 3, cost: 4, medianContext: 250_000, maxContext: 300_000 });
    expect(s.costShareAbove200k).toBeCloseTo(0.75, 9);
  });
});
