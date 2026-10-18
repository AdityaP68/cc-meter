import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_JS, ROOT, installFixture, tmpDir } from './helpers/util.js';

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

describe('hook launcher (plugin/scripts/sessionscope.sh)', () => {
  it('runs the CLI recorded in ~/.sessionscope/cli-path, with a payload on stdin, silently', () => {
    const home = tmpDir();
    const claude = tmpDir('claude-');
    const tp = installFixture('cc-2.1.287/sdk-complete.jsonl', claude);
    fs.writeFileSync(path.join(home, 'cli-path'), CLI_JS + '\n');
    const r = sh('sessionscope.sh', JSON.stringify({ transcript_path: tp, hook_event_name: 'SessionEnd', reason: 'other' }), {
      SESSIONSCOPE_HOME: home,
      PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
      CLAUDE_CONFIG_DIR: claude,
    }, ['record']);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
    expect(fs.readFileSync(path.join(home, 'record.log'), 'utf8')).toContain('recorded');
  });

  it('falls back to the pre-rename folder (and CCMETER_HOME) until ~/.sessionscope exists', () => {
    const fakeHome = tmpDir('home-');
    const claude = tmpDir('claude-');
    const tp = installFixture('cc-2.1.287/sdk-complete.jsonl', claude);
    const legacy = path.join(fakeHome, '.ccmeter');
    fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, 'cli-path'), CLI_JS + '\n');
    const env = { HOME: fakeHome, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, CLAUDE_CONFIG_DIR: claude };
    const payload = JSON.stringify({ transcript_path: tp, hook_event_name: 'SessionEnd', reason: 'other' });
    expect(sh('sessionscope.sh', payload, env, ['record']).status).toBe(0);
    expect(fs.readFileSync(path.join(legacy, 'record.log'), 'utf8')).toContain('recorded');
    // CCMETER_HOME still selects a folder when SESSIONSCOPE_HOME is unset
    const viaEnv = tmpDir();
    fs.writeFileSync(path.join(viaEnv, 'cli-path'), CLI_JS + '\n');
    expect(sh('sessionscope.sh', payload, { ...env, CCMETER_HOME: viaEnv }, ['record']).status).toBe(0);
    expect(fs.existsSync(path.join(viaEnv, 'record.log'))).toBe(true);
    // once ~/.sessionscope exists it wins over ~/.ccmeter
    const fresh = path.join(fakeHome, '.sessionscope');
    fs.mkdirSync(fresh);
    fs.writeFileSync(path.join(fresh, 'cli-path'), CLI_JS + '\n');
    expect(sh('sessionscope.sh', payload, env, ['record']).status).toBe(0);
    expect(fs.existsSync(path.join(fresh, 'record.log'))).toBe(true);
  });

  it('exits 0 silently when no CLI can be found (a missing recorder must never break a session)', () => {
    const r = sh('sessionscope.sh', '{}', { SESSIONSCOPE_HOME: tmpDir() }, ['record']);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
  });
});

describe('/sessionscope prompt hook (plugin/scripts/prompt-hook.sh)', () => {
  const home = tmpDir();
  const env = { SESSIONSCOPE_HOME: home, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin` };
  fs.writeFileSync(path.join(home, 'cli-path'), CLI_JS + '\n');

  it('ignores ordinary prompts without starting anything', () => {
    for (const prompt of ['fix the bug', 'what does /sessionscope do?', '/sessionscope extra words', '/sessionscopex']) {
      const r = sh('prompt-hook.sh', JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt }), env);
      expect(r.status, prompt).toBe(0);
      expect(r.stdout, prompt).toBe('');
    }
    expect(fs.existsSync(path.join(home, 'server.json'))).toBe(false);
  });

  it('stops "/sessionscope" with one labelled line, the dashboard URL, then the server can be stopped', () => {
    const claude = tmpDir('claude-');
    const r = sh('prompt-hook.sh', JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: '/sessionscope' }), { ...env, CLAUDE_CONFIG_DIR: claude });
    try {
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.continue).toBe(false);
      expect(out.stopReason).toMatch(/^sessionscope dashboard: http:\/\/127\.0\.0\.1:\d+\/$/);
    } finally {
      spawnSync(process.execPath, [CLI_JS, 'serve', '--stop'], { env: { ...process.env, SESSIONSCOPE_HOME: home } });
    }
  });
});

describe('sessionscope statusline', () => {
  it('prints "model | cost | tokens" from the stdin JSON and the transcript', () => {
    const home = tmpDir();
    const claude = tmpDir('claude-');
    const tp = installFixture('cc-2.1.287/sdk-complete.jsonl', claude);
    const run = () =>
      spawnSync(process.execPath, [CLI_JS, 'statusline'], {
        input: JSON.stringify({ model: { display_name: 'Sonnet 5.5' }, transcript_path: tp }),
        encoding: 'utf8',
        env: { ...process.env, SESSIONSCOPE_HOME: home },
      });
    const a = run();
    expect(a.status).toBe(0);
    expect(a.stdout).toMatch(/^Sonnet 5\.5 \| \$\d+\.\d+ \| [\d.]+[kM]? tok\n$/);
    expect(run().stdout).toBe(a.stdout); // cached path gives the same answer
    expect(fs.readdirSync(path.join(home, 'cache')).length).toBe(1);
  });

  it('never fails or writes to stderr on garbage input', () => {
    for (const input of ['', 'nope', '{}', JSON.stringify({ transcript_path: '/not/there.jsonl', cost: { total_cost_usd: 1.5 } })]) {
      const r = spawnSync(process.execPath, [CLI_JS, 'statusline'], { input, encoding: 'utf8', env: { ...process.env, SESSIONSCOPE_HOME: tmpDir() } });
      expect(r.status).toBe(0);
      expect(r.stderr).toBe('');
      expect(r.stdout.trim().split('\n')).toHaveLength(1);
    }
  });
});
