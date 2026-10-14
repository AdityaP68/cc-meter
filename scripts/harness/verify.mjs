#!/usr/bin/env node
// The in-task loop: one command that runs this project's real checks and prints ERRORS FIRST, capped, with the
// omitted amount stated. Runs every step (a test failure is information even when typecheck fails).
//   npm run verify              typecheck (core/cli/server + dashboard), build CLI, full test suite, repo checks
//   npm run verify -- --changed tests related to files changed vs HEAD (vitest's import graph), plus everything else
//   npm run verify -- --full    also `claude plugin validate .` and the dashboard build
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CAP = 2500;
const bin = (n) => path.join(ROOT, 'node_modules', '.bin', n);
const args = new Set(process.argv.slice(2));

function changedFiles() {
  const r = spawnSync('git', ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' });
  return r.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, ''));
}

/** Lines that carry the failure, in order; falls back to the tail. */
export function errorLines(text) {
  const keep = text.split('\n').filter((l) => /error TS\d+|\bFAIL\b|×|AssertionError|Error:|expected|Expected|Received|❯ .*:\d+:\d+|✘|^\s+at .*\.(ts|mjs):\d+/.test(l));
  return (keep.length ? keep : text.split('\n').slice(-40)).join('\n').trim();
}

export function cap(text, max = CAP) {
  return text.length <= max ? text : `${text.slice(0, max)}\n[... ${text.length - max} more characters omitted]`;
}

const steps = [
  { name: 'typecheck', cmd: bin('tsc'), args: ['-p', 'tsconfig.json', '--noEmit'] },
  { name: 'typecheck:dashboard', cmd: bin('tsc'), args: ['-p', 'dashboard/tsconfig.json', '--noEmit'] },
  // Tests run against .test-dist/, never dist/: the user's live hooks execute dist/, which changes only on `npm run build`.
  { name: 'build:test-dist', cmd: bin('tsc'), args: ['-p', 'tsconfig.json', '--outDir', '.test-dist'] },
];
let testArgs = ['run', '--reporter=dot'];
if (args.has('--changed')) {
  const files = changedFiles();
  const dataChanged = files.some((f) => /^(fixtures\/|pricing\.json|plugin\/)/.test(f));
  const code = files.filter((f) => /\.(ts|tsx|mjs)$/.test(f));
  if (!dataChanged && code.length) testArgs = ['related', '--run', '--reporter=dot', ...code];
  else if (!dataChanged && !code.length) testArgs = null;
}
if (testArgs) steps.push({ name: args.has('--changed') && testArgs[0] === 'related' ? 'tests (related)' : 'tests', cmd: bin('vitest'), args: testArgs });
steps.push({ name: 'checks', cmd: process.execPath, args: [path.join(ROOT, 'scripts', 'harness', 'check.mjs'), '--all'] });
if (args.has('--full')) {
  steps.push({ name: 'build:dashboard', cmd: bin('vite'), args: ['build', '--config', 'dashboard/vite.config.ts', '--logLevel', 'error'] });
  steps.push({ name: 'plugin validate', cmd: 'claude', args: ['plugin', 'validate', '.'] });
}

const results = steps.map((s) => {
  const t = Date.now();
  const r = spawnSync(s.cmd, s.args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const passed = r.status === 0;
  const summary = /Tests\s+(\d+ passed[^\n]*)/.exec(out)?.[1]?.trim();
  return { name: s.name, passed, ms: Date.now() - t, out, summary };
});

const failed = results.filter((r) => !r.passed);
console.log(`verify: ${failed.length ? 'FAIL' : 'PASS'}  ${results.map((r) => `${r.name} ${r.passed ? '✔' : '✘'}${r.summary ? ` (${r.summary})` : ''}`).join(' · ')}${testArgs ? '' : ' · tests skipped (no code changes)'}`);
if (failed.length) {
  let budget = CAP;
  for (const r of failed) {
    const body = cap(errorLines(r.out), Math.max(300, Math.floor(budget / failed.length)));
    console.log(`\n--- ${r.name} (exit != 0) ---\n${body}`);
    budget -= body.length;
  }
}
process.exit(failed.length ? 1 : 0);
