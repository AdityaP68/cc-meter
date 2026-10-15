import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { facets } from '../core/aggregate.js';
import { openDb } from '../core/db.js';
import { loadPricing } from '../core/pricing.js';
import { recordTranscript } from '../core/record.js';
import { asst, CLI_JS, tmpDir, user } from './helpers/util.js';

// The user asked for an upfront prompt when a model has no price: in the dashboard (banner), the status line and
// `ccmeter report`, pointing at ~/.ccmeter/pricing.json and `ccmeter doctor`. Never inside the conversation.
const setup = () => {
  const home = tmpDir();
  const claude = tmpDir('claude-');
  const dir = path.join(claude, 'projects', '-work-proj');
  fs.mkdirSync(dir, { recursive: true });
  const tp = path.join(dir, 'sess-unpriced.jsonl');
  fs.writeFileSync(tp, [user('go'), asst({ id: 'a', model: 'claude-sonnet-5-5', input: 10, output: 5 }), asst({ id: 'b', model: 'claude-mystery-9', input: 10, output: 5 })].join('\n'));
  return { home, claude, tp, env: { ...process.env, CCMETER_HOME: home, CLAUDE_CONFIG_DIR: claude } };
};
const cli = (args: string[], env: NodeJS.ProcessEnv, input?: string) => spawnSync(process.execPath, [CLI_JS, ...args], { encoding: 'utf8', env, input, timeout: 30000 });

describe('upfront prompt for unpriced models', () => {
  it('facets list the unpriced models across all data', () => {
    const { home, tp } = setup();
    const db = openDb(path.join(home, 'x.db'));
    recordTranscript(db, loadPricing({ overridePath: null }), tp);
    expect(facets(db).unpriced).toEqual(['claude-mystery-9']);
    db.close();
  });

  it('ccmeter report starts with a line naming the model and what to do', () => {
    const { env } = setup();
    expect(cli(['record', '--all'], env).status).toBe(0);
    for (const args of [['report'], ['report', '--by', 'model'], ['report', '--session', 'sess-unp']]) {
      const first = cli(args, env).stdout.split('\n')[0]!;
      expect(first).toContain('⚠ No price for claude-mystery-9');
      expect(first).toContain('~/.ccmeter/pricing.json');
      expect(first).toContain('ccmeter doctor');
    }
    expect(cli(['report', '--json'], env).stdout.trimStart().startsWith('{')).toBe(true); // JSON stays parseable
  });

  it('the status line marks a session that used an unpriced model, and stays one line', () => {
    const { env, tp } = setup();
    const r = cli(['statusline'], env, JSON.stringify({ model: { display_name: 'Sonnet 5.5' }, transcript_path: tp }));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/ \| ⚠ unpriced: claude-mystery-9\n$/);
    expect(r.stdout.split('\n')).toHaveLength(2);
    expect(cli(['statusline'], env, JSON.stringify({ model: { display_name: 'Sonnet 5.5' }, transcript_path: tp })).stdout).toBe(r.stdout); // cached
  });
});
