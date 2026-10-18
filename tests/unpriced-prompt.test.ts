import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { facets, overview } from '../core/aggregate.js';
import { runDoctor } from '../core/doctor.js';
import { claudeCodeFigures } from '../core/reconcile.js';
import { openDb } from '../core/db.js';
import { loadPricing } from '../core/pricing.js';
import { recordTranscript } from '../core/record.js';
import { asst, CLI_JS, tmpDir, user } from './helpers/util.js';

// The user asked for an upfront prompt when a model has no price: in the dashboard (banner), the status line and
// `agent-lens report`, pointing at ~/.agent-lens/pricing.json and `agent-lens doctor`. Never inside the conversation.
const setup = () => {
  const home = tmpDir();
  const claude = tmpDir('claude-');
  const dir = path.join(claude, 'projects', '-work-proj');
  fs.mkdirSync(dir, { recursive: true });
  const tp = path.join(dir, 'sess-unpriced.jsonl');
  fs.writeFileSync(tp, [user('go'), asst({ id: 'a', model: 'claude-sonnet-5-5', input: 10, output: 5 }), asst({ id: 'b', model: 'claude-mystery-9', input: 10, output: 5 })].join('\n'));
  return { home, claude, tp, env: { ...process.env, AGENT_LENS_HOME: home, CLAUDE_CONFIG_DIR: claude } };
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

  it('agent-lens report starts with a line naming the model and what to do', () => {
    const { env } = setup();
    expect(cli(['record', '--all'], env).status).toBe(0);
    for (const args of [['report'], ['report', '--by', 'model'], ['report', '--session', 'sess-unp']]) {
      const first = cli(args, env).stdout.split('\n')[0]!;
      expect(first).toContain('⚠ No price for claude-mystery-9');
      expect(first).toContain('~/.agent-lens/pricing.json');
      expect(first).toContain('agent-lens doctor');
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

describe("Claude Code's own figure for an unpriced model (stopgap, never in agent-lens's totals)", () => {
  const cs = (usd: number) => JSON.stringify({ type: 'cost-state', totalCostUSD: usd + 0.25, modelUsage: { 'claude-mystery-9': { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: usd, webSearchRequests: 0 }, 'claude-sonnet-5-5': { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.25, webSearchRequests: 0 } } });
  const mystery = (m: Record<string, number> | null) => ({ models: [{ model: 'claude-mystery-9' }], costState: m === null ? null : { totalCostUSD: 0, modelUsage: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: v, webSearchRequests: 0 }])) } });

  it('sums the costUSD Claude Code recorded for the model and counts the sessions it covers', () => {
    const f = claudeCodeFigures([mystery({ 'claude-mystery-9': 0.5 }), mystery({ 'claude-mystery-9': 1.25 }), mystery(null), mystery({ other: 9 })] as never, ['claude-mystery-9']);
    expect(f).toEqual([{ model: 'claude-mystery-9', sessions: 4, withFigure: 2, costUsd: 1.75 }]);
  });

  it('doctor shows it, labelled, and the agent-lens total still leaves the model out', () => {
    const { home, tp } = setup();
    fs.appendFileSync(tp, '\n' + cs(0.5));
    const db = openDb(path.join(home, 'x.db'));
    const table = loadPricing({ overridePath: null });
    recordTranscript(db, table, tp);
    const u = runDoctor(db, table, { skipExternal: true, claudeVersion: '2.1.287', pluginList: 'agent-lens@agent-lens ✔ enabled' }).find((c) => c.id === 'unpriced')!;
    expect(u.level).toBe('warn');
    expect(u.detail).toContain("Claude Code's figure for claude-mystery-9: $0.50 (in 1 of 1 session(s); not included in agent-lens's totals)");
    expect(overview(db, {}).costUsd).toBeLessThan(0.01); // only the priced sonnet message
    db.close();
  });
});
