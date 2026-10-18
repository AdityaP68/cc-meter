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

describe('hook launcher (plugin/scripts/agent-lens.sh)', () => {
  it('runs the CLI recorded in ~/.agent-lens/cli-path, with a payload on stdin, silently', () => {
    const home = tmpDir();
    const claude = tmpDir('claude-');
    const tp = installFixture('cc-2.1.287/sdk-complete.jsonl', claude);
    fs.writeFileSync(path.join(home, 'cli-path'), CLI_JS + '\n');
    const r = sh('agent-lens.sh', JSON.stringify({ transcript_path: tp, hook_event_name: 'SessionEnd', reason: 'other' }), {
      AGENT_LENS_HOME: home,
      PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
      CLAUDE_CONFIG_DIR: claude,
    }, ['record']);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
    expect(fs.readFileSync(path.join(home, 'record.log'), 'utf8')).toContain('recorded');
  });

  it('falls back to the folders and env vars of earlier names until ~/.agent-lens exists', () => {
    const fakeHome = tmpDir('home-');
    const claude = tmpDir('claude-');
    const tp = installFixture('cc-2.1.287/sdk-complete.jsonl', claude);
    const env = { HOME: fakeHome, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, CLAUDE_CONFIG_DIR: claude };
    const payload = JSON.stringify({ transcript_path: tp, hook_event_name: 'SessionEnd', reason: 'other' });
    const folder = (dir: string) => {
      const d = path.join(fakeHome, dir);
      fs.mkdirSync(d);
      fs.writeFileSync(path.join(d, 'cli-path'), CLI_JS + '\n');
      return d;
    };
    const ran = (dir: string) => fs.existsSync(path.join(dir, 'record.log'));
    const ccmeter = folder('.ccmeter');
    expect(sh('agent-lens.sh', payload, env, ['record']).status).toBe(0);
    expect(ran(ccmeter)).toBe(true);
    const sessionscope = folder('.sessionscope');
    sh('agent-lens.sh', payload, env, ['record']);
    expect(ran(sessionscope)).toBe(true);
    // the env vars of earlier names still select a folder; the newest name wins
    for (const key of ['CCMETER_HOME', 'SESSIONSCOPE_HOME']) {
      const viaEnv = tmpDir();
      fs.writeFileSync(path.join(viaEnv, 'cli-path'), CLI_JS + '\n');
      expect(sh('agent-lens.sh', payload, { ...env, [key]: viaEnv }, ['record']).status).toBe(0);
      expect(ran(viaEnv), key).toBe(true);
    }
    const fresh = folder('.agent-lens');
    sh('agent-lens.sh', payload, env, ['record']);
    expect(ran(fresh)).toBe(true);
  });

  it('exits 0 silently when no CLI can be found (a missing recorder must never break a session)', () => {
    const r = sh('agent-lens.sh', '{}', { AGENT_LENS_HOME: tmpDir() }, ['record']);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
  });
});

describe('/agent-lens prompt hook (plugin/scripts/prompt-hook.sh)', () => {
  const home = tmpDir();
  const env = { AGENT_LENS_HOME: home, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin` };
  fs.writeFileSync(path.join(home, 'cli-path'), CLI_JS + '\n');

  it('ignores ordinary prompts without starting anything', () => {
    for (const prompt of ['fix the bug', 'what does /agent-lens do?', '/agent-lens extra words', '/agent-lensx']) {
      const r = sh('prompt-hook.sh', JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt }), env);
      expect(r.status, prompt).toBe(0);
      expect(r.stdout, prompt).toBe('');
    }
    expect(fs.existsSync(path.join(home, 'server.json'))).toBe(false);
  });

  it('stops "/agent-lens" with one labelled line, the dashboard URL, then the server can be stopped', () => {
    const claude = tmpDir('claude-');
    const r = sh('prompt-hook.sh', JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: '/agent-lens' }), { ...env, CLAUDE_CONFIG_DIR: claude });
    try {
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.continue).toBe(false);
      expect(out.stopReason).toMatch(/^agent-lens dashboard: http:\/\/127\.0\.0\.1:\d+\/$/);
    } finally {
      spawnSync(process.execPath, [CLI_JS, 'serve', '--stop'], { env: { ...process.env, AGENT_LENS_HOME: home } });
    }
  });
});

describe('agent-lens statusline', () => {
  it('prints "model | cost | tokens" from the stdin JSON and the transcript', () => {
    const home = tmpDir();
    const claude = tmpDir('claude-');
    const tp = installFixture('cc-2.1.287/sdk-complete.jsonl', claude);
    const run = () =>
      spawnSync(process.execPath, [CLI_JS, 'statusline'], {
        input: JSON.stringify({ model: { display_name: 'Sonnet 5.5' }, transcript_path: tp }),
        encoding: 'utf8',
        env: { ...process.env, AGENT_LENS_HOME: home },
      });
    const a = run();
    expect(a.status).toBe(0);
    expect(a.stdout).toMatch(/^Sonnet 5\.5 \| \$\d+\.\d+ \| [\d.]+[kM]? tok\n$/);
    expect(run().stdout).toBe(a.stdout); // cached path gives the same answer
    expect(fs.readdirSync(path.join(home, 'cache')).length).toBe(1);
  });

  it('never fails or writes to stderr on garbage input', () => {
    for (const input of ['', 'nope', '{}', JSON.stringify({ transcript_path: '/not/there.jsonl', cost: { total_cost_usd: 1.5 } })]) {
      const r = spawnSync(process.execPath, [CLI_JS, 'statusline'], { input, encoding: 'utf8', env: { ...process.env, AGENT_LENS_HOME: tmpDir() } });
      expect(r.status).toBe(0);
      expect(r.stderr).toBe('');
      expect(r.stdout.trim().split('\n')).toHaveLength(1);
    }
  });
});
