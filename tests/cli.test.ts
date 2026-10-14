import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, installFixture, tmpDir } from './helpers/util.js';

const CLI = path.join(ROOT, 'dist', 'cli', 'index.js');
const run = (args: string[], env: Record<string, string>, input?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, input, timeout: 30000 });

describe('ccmeter CLI (built)', () => {
  const claude = tmpDir('claude-');
  const home = tmpDir();
  const env = { CLAUDE_CONFIG_DIR: claude, CCMETER_HOME: home };
  const transcript = installFixture('cc-2.1.287/sdk-complete.jsonl', claude);

  it('hook mode: reads the real Stop payload shape from stdin, prints nothing, exits 0, records the session', () => {
    const payload = JSON.stringify({
      session_id: path.basename(transcript, '.jsonl'),
      transcript_path: transcript,
      cwd: '/fixture/project',
      hook_event_name: 'Stop',
      stop_hook_active: false,
      last_assistant_message: 'SECRET REPLY TEXT',
      background_tasks: [],
      session_crons: [],
    });
    const r = run(['record'], env, payload);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
    const report = run(['report', '--json'], env);
    const j = JSON.parse(report.stdout);
    expect(j.sessions).toHaveLength(1);
    expect(j.sessions[0].sessionId).toBe(path.basename(transcript, '.jsonl'));
    // the reply text from the payload must never be stored
    const dbBytes = fs.readFileSync(path.join(home, 'ccmeter.db'));
    expect(dbBytes.includes(Buffer.from('SECRET REPLY TEXT'))).toBe(false);
  });

  it('hook mode never fails a session, even on garbage input or a missing transcript', () => {
    for (const input of ['', 'not json', '{}', JSON.stringify({ transcript_path: '/definitely/not/here.jsonl', hook_event_name: 'SessionEnd', reason: 'other' })]) {
      const r = run(['record'], env, input);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
    }
    expect(fs.readFileSync(path.join(home, 'record.log'), 'utf8')).toContain('hook');
  });

  it('doctor exits 0 and lists checks; report --session prints the Claude Code reconciliation', () => {
    const d = run(['doctor'], env);
    expect(d.status).toBe(0);
    expect(d.stdout).toContain('Database');
    const s = run(['report', '--session', path.basename(transcript, '.jsonl').slice(0, 8)], env);
    expect(s.status).toBe(0);
    expect(s.stdout).toContain('MATCH');
  });

  it('export produces content-free csv', () => {
    const r = run(['export', '--format', 'csv'], env);
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n')[0]).toContain('sessionId');
  });

  it('unknown commands fail with usage', () => {
    expect(run(['bogus'], env).status).toBe(1);
    expect(run([], env).stdout).toContain('ccmeter record');
  });
});
