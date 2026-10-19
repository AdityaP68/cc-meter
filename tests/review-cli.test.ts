import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../cli/args.js';
import { runReview } from '../cli/commands/review.js';
import { recordSynthetic, SENTINEL_INPUT, SENTINEL_OUTPUT, SENTINEL_SECRET } from './helpers/review.js';
import { makeStubClaude } from './helpers/stub-claude.js';
import { CLI_JS } from './helpers/util.js';

const BOOLS = ['json', 'dry-run', 'show-input', 'yes', 'force', 'accept-data-leaves-machine'];

describe('ccmeter review (built CLI, stub claude)', () => {
  let s: ReturnType<typeof recordSynthetic>;
  let stub: ReturnType<typeof makeStubClaude>;
  let env: Record<string, string>;
  const cli = (args: string[], extra: Record<string, string> = {}) =>
    spawnSync(process.execPath, [CLI_JS, ...args], { encoding: 'utf8', env: { ...process.env, ...env, ...extra }, input: '', timeout: 60000 });
  beforeEach(() => {
    s = recordSynthetic();
    stub = makeStubClaude();
    env = { CCMETER_HOME: s.home, CLAUDE_CONFIG_DIR: s.claude, CCMETER_CLAUDE_BIN: stub.bin, STUB_LOG: stub.log };
    s.db.close();
  });

  it('refuses the first review without explicit consent (no TTY), spends nothing, and says why', () => {
    const r = cli(['review', s.sessionId]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/leave|off this machine/);
    expect(r.stderr).toContain('--accept-data-leaves-machine');
    expect(r.stdout).toMatch(/Estimated cost of a review: about \$/);
    expect(stub.calls()).toHaveLength(0);
    expect(fs.existsSync(path.join(s.home, 'config.json'))).toBe(false);
  });

  it('prints the estimate, runs with the consent flag, stores consent, prints the review and the overhead', () => {
    const r = cli(['review', s.sessionId.slice(0, 8), '--accept-data-leaves-machine', '--model', 'claude-haiku-5-5']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.indexOf('Estimated cost')).toBeLessThan(r.stdout.indexOf('Review of session'));
    expect(r.stdout).toContain('Hints from simple rules');
    expect(r.stdout).toMatch(/4 of 8 tool calls returned an error/);
    expect(r.stdout).toContain('partly achieved');
    expect(r.stdout).toMatch(/turn 1 {2}clarity 4 {2}context 3 {2}scope 5 {2}verifiability 2/);
    expect(r.stdout).toMatch(/Review overhead so far: 1 review, \$0\.012/);
    expect(stub.calls()).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(s.home, 'config.json'), 'utf8')).review.consent.version).toBe(1);
  });

  it('a repeat is free (cached); a later run needs --yes when not interactive; --force runs again', () => {
    cli(['review', s.sessionId, '--accept-data-leaves-machine']);
    const again = cli(['review', s.sessionId]);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('cached');
    expect(stub.calls()).toHaveLength(1);
    const noYes = cli(['review', s.sessionId, '--force']);
    expect(noYes.status).toBe(2);
    expect(noYes.stderr).toContain('--yes');
    expect(stub.calls()).toHaveLength(1);
    expect(cli(['review', s.sessionId, '--force', '--yes']).status).toBe(0);
    expect(stub.calls()).toHaveLength(2);
    // a different model is a different review
    expect(cli(['review', s.sessionId, '--yes', '--model', 'claude-opus-5-5']).status).toBe(0);
    expect(stub.calls()).toHaveLength(3);
  });

  it('--dry-run and --show-input spend nothing; the payload is redacted and carries no tool text', () => {
    const d = cli(['review', s.sessionId, '--dry-run']);
    expect(d.status).toBe(0);
    expect(d.stdout).toContain('Not run (--dry-run)');
    const i = cli(['review', s.sessionId, '--show-input']);
    expect(i.stdout).toContain('<digest>');
    for (const bad of [SENTINEL_INPUT, SENTINEL_OUTPUT, SENTINEL_SECRET]) expect(i.stdout).not.toContain(bad);
    expect(stub.calls()).toHaveLength(0);
  });

  it('--json is machine readable and contains the review, flags and cost', () => {
    const r = cli(['review', s.sessionId, '--accept-data-leaves-machine', '--json']);
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
    expect(j.review.prompt_scores).toHaveLength(3);
    expect(j.flags.length).toBeGreaterThan(0);
    expect(j.costUsd).toBe(0.0123);
    expect(Object.keys(j)).not.toContain('user');
  });

  it('errors clearly: unknown session, a judge session, a failing judge', () => {
    expect(cli(['review', 'nope']).stderr).toMatch(/no recorded session/);
    expect(cli(['review']).status).toBe(1);
    cli(['review', s.sessionId, '--accept-data-leaves-machine']);
    const judgeId = (new (require('node:sqlite').DatabaseSync)(path.join(s.home, 'ccmeter.db')).prepare("SELECT session_id FROM sessions WHERE source = 'ccmeter-judge'").get() as { session_id: string }).session_id;
    expect(cli(['review', judgeId]).stderr).toMatch(/review run by ccmeter itself/);
    const bad = cli(['review', s.sessionId, '--force', '--yes'], { STUB_MODE: 'error' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('Not logged in');
  });

  it('report lists review overhead apart from the usage totals', () => {
    cli(['review', s.sessionId, '--accept-data-leaves-machine']);
    const r = cli(['report']);
    expect(r.stdout).toMatch(/^1 sessions,/m);
    expect(r.stdout).toMatch(/Review overhead \(not in the totals above\): 1 review, \$0\.012/);
  });
});

describe('interactive consent (in-process)', () => {
  let s: ReturnType<typeof recordSynthetic>;
  let stub: ReturnType<typeof makeStubClaude>;
  let out: string[];
  beforeEach(() => {
    s = recordSynthetic();
    stub = makeStubClaude();
    s.db.close();
    Object.assign(process.env, { CCMETER_HOME: s.home, CLAUDE_CONFIG_DIR: s.claude, CCMETER_CLAUDE_BIN: stub.bin, STUB_LOG: stub.log });
    out = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a) => void out.push(a.join(' ')));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of ['CCMETER_HOME', 'CLAUDE_CONFIG_DIR', 'CCMETER_CLAUDE_BIN', 'STUB_LOG']) delete process.env[k];
  });
  const args = () => parseArgs([s.sessionId], BOOLS);
  const io = (...answers: string[]) => {
    const asked: string[] = [];
    return { asked, io: { interactive: true, ask: async (q: string) => (asked.push(q), answers.shift() ?? '') } };
  };

  it('anything but "yes" at the consent prompt means no review and no stored consent', async () => {
    const t = io('y');
    expect(await runReview(args(), t.io)).toBe(2);
    expect(stub.calls()).toHaveLength(0);
    expect(fs.existsSync(path.join(s.home, 'config.json'))).toBe(false);
    expect(t.asked[0]).toContain('"yes"');
  });

  it('"yes" runs the review and remembers; the next review asks a short cost question instead', async () => {
    expect(await runReview(args(), io('yes').io)).toBe(0);
    expect(stub.calls()).toHaveLength(1);
    const t = io('n');
    expect(await runReview(parseArgs([s.sessionId, '--force'], BOOLS), t.io)).toBe(2);
    expect(t.asked[0]).toBe('Run this review? [y/N] ');
    expect(stub.calls()).toHaveLength(1);
    expect(await runReview(parseArgs([s.sessionId, '--force'], BOOLS), io('y').io)).toBe(0);
    expect(stub.calls()).toHaveLength(2);
  });
});
