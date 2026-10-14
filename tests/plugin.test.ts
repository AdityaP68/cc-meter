import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, installFixture, tmpDir } from './helpers/util.js';

const PLUGIN = path.join(ROOT, 'plugin');
const sh = (script: string, input: string, env: Record<string, string> = {}, args: string[] = []) =>
  spawnSync('sh', [path.join(PLUGIN, 'scripts', script), ...args], { input, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', ...env }, timeout: 20000 });

describe('plugin manifests', () => {
  it('has valid JSON manifests with a matching plugin name, and no absolute paths anywhere in the plugin', () => {
    const plugin = JSON.parse(fs.readFileSync(path.join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
    const market = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
    expect(market.plugins[0].name).toBe(plugin.name);
    expect(market.plugins[0].source).toBe('./plugin');
    const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'));
    expect(Object.keys(hooks.hooks).sort()).toEqual(['SessionEnd', 'Stop', 'UserPromptSubmit']);
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of [...walk(PLUGIN), path.join(ROOT, 'install.sh'), path.join(ROOT, 'package.json'), path.join(ROOT, 'pricing.json')]) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/\/Users\/|\/home\/[a-z]|C:\\\\Users/);
    }
  });

  it('ships no loadable skill (zero context footprint until milestone 3)', () => {
    expect(fs.existsSync(path.join(PLUGIN, 'skills', 'convo-review', 'SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(PLUGIN, 'skills', 'convo-review', 'SKILL.md.stub'))).toBe(true);
  });
});

describe('hook launcher (plugin/scripts/ccmeter.sh)', () => {
  it('runs the CLI recorded in ~/.ccmeter/cli-path, with a payload on stdin, silently', () => {
    const home = tmpDir();
    const claude = tmpDir('claude-');
    const tp = installFixture('cc-2.1.287/sdk-complete.jsonl', claude);
    fs.writeFileSync(path.join(home, 'cli-path'), path.join(ROOT, 'dist', 'cli', 'index.js') + '\n');
    const r = sh('ccmeter.sh', JSON.stringify({ transcript_path: tp, hook_event_name: 'SessionEnd', reason: 'other' }), {
      CCMETER_HOME: home,
      PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
      CLAUDE_CONFIG_DIR: claude,
    }, ['record']);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
    expect(fs.readFileSync(path.join(home, 'record.log'), 'utf8')).toContain('recorded');
  });

  it('exits 0 silently when no CLI can be found (a missing recorder must never break a session)', () => {
    const r = sh('ccmeter.sh', '{}', { CCMETER_HOME: tmpDir() }, ['record']);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
  });
});

describe('/ccmeter prompt hook (plugin/scripts/prompt-hook.sh)', () => {
  const home = tmpDir();
  const env = { CCMETER_HOME: home, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin` };
  fs.writeFileSync(path.join(home, 'cli-path'), path.join(ROOT, 'dist', 'cli', 'index.js') + '\n');

  it('ignores ordinary prompts without starting anything', () => {
    for (const prompt of ['fix the bug', 'what does /ccmeter do?', '/ccmeter extra words', '/ccmeterx']) {
      const r = sh('prompt-hook.sh', JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt }), env);
      expect(r.status, prompt).toBe(0);
      expect(r.stdout, prompt).toBe('');
    }
    expect(fs.existsSync(path.join(home, 'server.json'))).toBe(false);
  });

  it('blocks "/ccmeter" with the dashboard URL as the single line of output, then the server can be stopped', () => {
    const claude = tmpDir('claude-');
    const r = sh('prompt-hook.sh', JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: '/ccmeter' }), { ...env, CLAUDE_CONFIG_DIR: claude });
    try {
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.decision).toBe('block');
      expect(out.reason).toMatch(/^ccmeter dashboard: http:\/\/127\.0\.0\.1:\d+\/$/);
    } finally {
      spawnSync(process.execPath, [path.join(ROOT, 'dist', 'cli', 'index.js'), 'serve', '--stop'], { env: { ...process.env, CCMETER_HOME: home } });
    }
  });
});

describe('ccmeter statusline', () => {
  it('prints "model | cost | tokens" from the stdin JSON and the transcript', () => {
    const home = tmpDir();
    const claude = tmpDir('claude-');
    const tp = installFixture('cc-2.1.287/sdk-complete.jsonl', claude);
    const run = () =>
      spawnSync(process.execPath, [path.join(ROOT, 'dist', 'cli', 'index.js'), 'statusline'], {
        input: JSON.stringify({ model: { display_name: 'Sonnet 5.5' }, transcript_path: tp }),
        encoding: 'utf8',
        env: { ...process.env, CCMETER_HOME: home },
      });
    const a = run();
    expect(a.status).toBe(0);
    expect(a.stdout).toMatch(/^Sonnet 5\.5 \| \$\d+\.\d+ \| [\d.]+[kM]? tok\n$/);
    expect(run().stdout).toBe(a.stdout); // cached path gives the same answer
    expect(fs.readdirSync(path.join(home, 'cache')).length).toBe(1);
  });

  it('never fails or writes to stderr on garbage input', () => {
    for (const input of ['', 'nope', '{}', JSON.stringify({ transcript_path: '/not/there.jsonl', cost: { total_cost_usd: 1.5 } })]) {
      const r = spawnSync(process.execPath, [path.join(ROOT, 'dist', 'cli', 'index.js'), 'statusline'], { input, encoding: 'utf8', env: { ...process.env, CCMETER_HOME: tmpDir() } });
      expect(r.status).toBe(0);
      expect(r.stderr).toBe('');
      expect(r.stdout.trim().split('\n')).toHaveLength(1);
    }
  });
});
