#!/usr/bin/env node
// SessionStart hook: print where this checkout stands, so a session (fresh, resumed or compacted) does not spend
// 3-8 tool calls re-deriving it. Ported from the context-harness method (scripts/session_orientation.py there).
// Stdout becomes context. Reads only Git, `claude --version`, file mtimes and committed docs. Never fails a session.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The handoff's `## Next` is injected whole up to this size (~700 tokens). */
export const MAX_NEXT_CHARS = 2500;

const run = (cmd, args, cwd = ROOT) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const git = (...args) => run('git', ['--no-optional-locks', ...args]);

export function nextSection(text, cap = MAX_NEXT_CHARS) {
  const m = /^## Next[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!m) return null;
  let body = m[1].trim();
  if (body.length > cap) body = body.slice(0, cap).replace(/\n[^\n]*$/, '') + '\n[... truncated; read docs/handoff.md for the rest]';
  return body;
}

export function cmpVersion(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  return 0;
}

/** Newest mtime among files under dirs matching ext. */
function newest(dirs, ext) {
  let best = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(ext)) best = Math.max(best, fs.statSync(p).mtimeMs);
    }
  };
  for (const d of dirs) if (fs.existsSync(d)) walk(d);
  return best;
}

function hostLine() {
  const src = fs.readFileSync(path.join(ROOT, 'core', 'parser', 'cc21.ts'), 'utf8');
  const m = /verifiedRange:\s*\['([\d.]+)',\s*'([\d.]+)'\]/.exec(src);
  let ver = null;
  try {
    ver = /\d+\.\d+\.\d+/.exec(run('claude', ['--version']))?.[0] ?? null;
  } catch {
    /* not on PATH */
  }
  if (!m) return `- Claude Code on PATH: ${ver ?? 'not found'} (parser range unreadable)`;
  const [, lo, hi] = m;
  const verdict = !ver ? 'not found' : cmpVersion(ver, hi) > 0 ? `NEWER than the verified range ${lo}..${hi}: consider the format-drift skill` : cmpVersion(ver, lo) < 0 ? `older than ${lo}` : `within the verified range ${lo}..${hi}`;
  return `- Claude Code on PATH: ${ver ?? '-'}; ${verdict}`;
}

/** The user's real install runs this checkout's dist/ (hooks) and plugin/ (loaded in place). */
function liveInstallLines() {
  const out = [];
  const home = process.env.CCMETER_HOME || path.join(os.homedir(), '.ccmeter');
  let target = null;
  try {
    target = fs.readFileSync(path.join(home, 'cli-path'), 'utf8').trim();
  } catch {
    /* not installed */
  }
  const live = target && path.resolve(target).startsWith(ROOT + path.sep);
  out.push(live ? '- LIVE: the user\'s installed ccmeter runs THIS checkout (dist/ for hooks, plugin/ loaded in place). A broken build or plugin edit affects their real Claude Code.' : `- ccmeter install: ${target ? `points elsewhere (${target})` : 'not installed for this user'}`);
  const dist = path.join(ROOT, 'dist', 'cli', 'index.js');
  const src = newest(['core', 'cli', 'server'].map((d) => path.join(ROOT, d)), '.ts');
  if (!fs.existsSync(dist)) out.push('- dist/ missing: run `npm run build`');
  else if (src > fs.statSync(dist).mtimeMs) out.push(`- dist/ is OLDER than the TypeScript sources${live ? ': the live hooks run stale code' : ''}; run \`npm run build\` once changes are verified`);
  return out;
}

function handoffStaleness() {
  const last = git('log', '-1', '--format=%H', '--', 'docs/handoff.md');
  if (!last) return null;
  const changed = git('diff', '--name-only', `${last}..HEAD`).split('\n').filter((p) => p && !p.startsWith('docs/'));
  if (!changed.length) return null;
  return `- WARNING: docs/handoff.md last changed ${git('rev-list', '--count', `${last}..HEAD`)} commit(s) ago and ${changed.length} non-doc file(s) changed since; its Next steps may be stale.`;
}

export function lines() {
  const out = ['ccmeter session orientation (SessionStart hook). Verify before acting on it.'];
  const branch = git('branch', '--show-current') || '(detached)';
  const dirty = git('status', '--porcelain').split('\n').filter(Boolean).length;
  out.push(`- Here: ${branch} @ ${git('rev-parse', '--short', 'HEAD')}, ${dirty} uncommitted path(s); last tag ${(() => { try { return git('describe', '--tags', '--abbrev=0'); } catch { return 'none'; } })()}`);
  for (const block of git('worktree', 'list', '--porcelain').split('\n\n')) {
    const wt = /^worktree (.+)$/m.exec(block)?.[1];
    if (!wt || path.resolve(wt) === ROOT) continue;
    const head = /^HEAD (\w+)/m.exec(block)?.[1] ?? '';
    const br = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? `detached ${head.slice(0, 7)}`;
    out.push(`- Other worktree: ${br} has ${git('rev-list', '--count', `HEAD..${head}`)} commit(s) not here (${wt})`);
  }
  out.push(hostLine());
  out.push(...liveInstallLines());
  let hooksPath = '';
  try {
    hooksPath = git('config', '--get', 'core.hooksPath');
  } catch {
    /* unset */
  }
  if (hooksPath !== '.githooks') out.push('- Git pre-commit checks are NOT enabled here: run `git config core.hooksPath .githooks`');
  const current = path.join(ROOT, 'docs', 'current.md');
  const updated = fs.existsSync(current) ? /^\*\*Updated:\*\*.*$/m.exec(fs.readFileSync(current, 'utf8'))?.[0] : null;
  out.push(`- docs/current.md ${updated ?? '(missing or no Updated header)'}`);
  const stale = handoffStaleness();
  if (stale) out.push(stale);
  const handoff = path.join(ROOT, 'docs', 'handoff.md');
  const nxt = fs.existsSync(handoff) ? nextSection(fs.readFileSync(handoff, 'utf8')) : null;
  if (nxt) out.push('', 'Next steps from docs/handoff.md (to resume: do item 1, stop where it says):', nxt);
  else out.push("- docs/handoff.md has no '## Next' section; ask the user what to do.");
  out.push('', 'Verify loop: `npm run verify` (or `npm run verify -- --changed`). Read docs/current.md before substantial work; retrieve other docs by grep, on demand.');
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(lines().join('\n'));
  } catch (e) {
    console.log(`ccmeter session orientation unavailable: ${e?.message ?? e}`);
  }
  process.exit(0);
}
