#!/usr/bin/env node
// Checks that must hold ("prose advises; checks enforce"). Run by .githooks/pre-commit (staged files) and by
// `npm run verify` (--all). Each check exists because the rule was broken or nearly broken while building agent-lens;
// see docs/memory/lessons.md.
//   --staged (default)  content checks on staged files     --all  content checks on all tracked files
//   --lock-migrations   record the current migration hashes (only when a migration ships to users)
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCK = path.join(ROOT, 'core', 'migrations.lock.json');
const git = (...a) => execFileSync('git', ['--no-optional-locks', ...a], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Personal data and secrets that must never be committed (the repo is meant for npm). */
export function scanText(text, username = os.userInfo().username) {
  const hits = [];
  const rules = [
    [/\/Users\/[A-Za-z0-9._-]+\//g, 'absolute macOS home path'],
    [/\/home\/[a-z][a-z0-9_-]+\//g, 'absolute Linux home path'],
    [/[A-Z]:\\\\?Users\\\\?[A-Za-z]/g, 'absolute Windows home path'],
    [/sk-ant-[A-Za-z0-9_-]{8,}/g, 'Anthropic API key'],
    [/\b[A-Za-z0-9._%+-]+@(?!anthropic\.com\b|example\.(?:com|org)\b|users\.noreply\.github\.com\b)[A-Za-z0-9.-]+\.[a-z]{2,}\b/g, 'email address'],
  ];
  if (username && username.length >= 4) rules.push([new RegExp(`\\b${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), `local username "${username}"`]);
  for (const [re, what] of rules) for (const m of text.matchAll(re)) hits.push({ what, match: m[0], index: m.index });
  return hits;
}

/** sha256 per migration version, read from core/db.ts. */
export function migrationHashes(src = fs.readFileSync(path.join(ROOT, 'core', 'db.ts'), 'utf8')) {
  const out = {};
  for (const m of src.matchAll(/version:\s*(\d+),\s*sql:\s*`([\s\S]*?)`/g)) out[m[1]] = crypto.createHash('sha256').update(m[2]).digest('hex');
  return out;
}

/**
 * The review skill is a wrapper, nothing more (AGENTS.md invariant): user-invoked only, one shell line that calls the plugin
 * launcher with `review`, no instruction that would make the session read, quote or store the digest or a transcript.
 */
export function skillErrors(text) {
  const errors = [];
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) return ['needs front matter'];
  const [, front, body] = m;
  const field = (k) => new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(front)?.[1]?.trim();
  if (field('disable-model-invocation') !== 'true') errors.push('must set disable-model-invocation: true (only the user starts a review)');
  if (field('allowed-tools') !== 'Bash(*/scripts/agent-lens.sh review *)') errors.push('allowed-tools must be exactly Bash(*/scripts/agent-lens.sh review *)');
  if ((field('description') ?? '').length > 100) errors.push('description must stay under 100 characters (it is in every session context)');
  const shell = body.split('\n').filter((l) => l.startsWith('!'));
  if (shell.length !== 1 || !/^!`"\$\{CLAUDE_PLUGIN_ROOT\}"\/scripts\/agent-lens\.sh review "\$ARGUMENTS"( --yes)?`$/.test(shell[0])) errors.push('must contain exactly one shell line: agent-lens.sh review "$ARGUMENTS" [--yes]');
  if (/digest|--show-input|transcript|\.jsonl/i.test(body)) errors.push('must not mention the digest or transcripts (it may not load them into the session)');
  if (body.split('\n').filter((l) => l.trim()).length > 3) errors.push('body is longer than the one command and one reply instruction');
  return errors;
}

const words = (t) => t.split(/\s+/).filter(Boolean).length;

export function structuralChecks() {
  const errors = [];
  const read = (p) => (fs.existsSync(path.join(ROOT, p)) ? fs.readFileSync(path.join(ROOT, p), 'utf8') : null);
  // shipped migrations are immutable (v1 is applied to real users' databases)
  const lock = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : {};
  const now = migrationHashes();
  for (const [v, h] of Object.entries(lock)) {
    if (!now[v]) errors.push(`migration v${v} was removed from core/db.ts; shipped migrations are append-only`);
    else if (now[v] !== h) errors.push(`migration v${v} was edited after it shipped; add a new migration instead (core/db.ts)`);
  }
  // entry documents stay bounded and dated
  for (const p of ['docs/current.md', 'docs/handoff.md', 'docs/status.md']) {
    const t = read(p);
    if (t === null) errors.push(`${p} is missing`);
    else if (!/^\*\*Updated:\*\* \d{4}-\d{2}-\d{2}/m.test(t)) errors.push(`${p} needs an "**Updated:** YYYY-MM-DD" line`);
  }
  const current = read('docs/current.md');
  if (current && words(current) > 500) errors.push(`docs/current.md is ${words(current)} words; keep it under 500 (rewrite, don't append)`);
  const handoff = read('docs/handoff.md');
  const next = handoff && /^## Next[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(handoff);
  if (handoff && !next) errors.push('docs/handoff.md has no "## Next" section');
  else if (next && next[1].trim().length > 2500) errors.push(`docs/handoff.md "## Next" is ${next[1].trim().length} chars; the SessionStart hook injects at most 2500`);
  const instr = (read('CLAUDE.md') ?? '') + (read('AGENTS.md') ?? '');
  if (instr.split('\n').length > 200) errors.push(`CLAUDE.md + AGENTS.md are ${instr.split('\n').length} lines; keep them under 200 (move detail to rules, skills or docs)`);
  // zero context footprint: the only loadable skill is the thin review wrapper, and it may only run `agent-lens review`
  const skills = path.join(ROOT, 'plugin', 'skills');
  if (fs.existsSync(skills))
    for (const d of fs.readdirSync(skills)) {
      const f = path.join(skills, d, 'SKILL.md');
      if (!fs.existsSync(f)) continue;
      if (d !== 'convo-review') errors.push(`plugin/skills/${d}/SKILL.md would load into every user's session (~39 tokens); only convo-review (a wrapper for \`agent-lens review\`) is allowed`);
      else for (const e of skillErrors(fs.readFileSync(f, 'utf8'))) errors.push(`plugin/skills/convo-review/SKILL.md: ${e}`);
    }
  for (const s of ['plugin/scripts/agent-lens.sh', 'plugin/scripts/prompt-hook.sh']) {
    try {
      fs.accessSync(path.join(ROOT, s), fs.constants.X_OK);
    } catch {
      errors.push(`${s} must exist and be executable`);
    }
  }
  return errors;
}

function contentFiles(mode) {
  if (mode === 'staged') return git('diff', '--cached', '--name-only', '--diff-filter=ACMR').split('\n').filter(Boolean);
  return git('ls-files').split('\n').filter(Boolean);
}
const fileText = (mode, f) => (mode === 'staged' ? git('show', `:${f}`) : fs.readFileSync(path.join(ROOT, f), 'utf8'));
const SKIP = /(^|\/)(package-lock\.json|LICENSE)$|\.(png|ico|woff2?)$/;

function main() {
  const argv = new Set(process.argv.slice(2));
  if (argv.has('--lock-migrations')) {
    fs.writeFileSync(LOCK, JSON.stringify(migrationHashes(), null, 2) + '\n');
    console.log(`locked migrations: ${Object.keys(migrationHashes()).join(', ')}`);
    return 0;
  }
  const mode = argv.has('--all') ? 'all' : 'staged';
  const errors = structuralChecks();
  for (const f of contentFiles(mode)) {
    if (SKIP.test(f)) continue;
    let text;
    try {
      text = fileText(mode, f);
    } catch {
      continue;
    }
    for (const h of scanText(text)) {
      const line = text.slice(0, h.index).split('\n').length;
      errors.push(`${f}:${line}: ${h.what} (${h.match.slice(0, 40)})`);
    }
  }
  if (errors.length) {
    console.error(`agent-lens checks failed (${errors.length}):\n- ${errors.slice(0, 30).join('\n- ')}${errors.length > 30 ? `\n… ${errors.length - 30} more` : ''}`);
    return 1;
  }
  console.log(`agent-lens checks passed (${mode})`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
