#!/usr/bin/env node
// react-check static pass: heuristic greps for React pitfalls. Zero dependencies, Node >= 18.
// Usage: node static-check.mjs [srcDir ...]   (default: src). Exit 1 if any `error` finding.
// Findings are candidates for review, not verdicts; `error` rules are the ones with no false-positive excuse.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['src'];
const CAP = 20;
const out = [];

function walk(p, files = []) {
  const s = statSync(p);
  if (s.isFile()) { if (/\.(t|j)sx?$/.test(p) && !/\.(test|spec|d)\./.test(p)) files.push(p); return files; }
  for (const e of readdirSync(p)) if (!/^(node_modules|dist|build|\.)/.test(e)) walk(join(p, e), files);
  return files;
}

// Blank comments and string/template contents (keeping newlines) so regexes see code only and line numbers hold.
function mask(src) {
  let o = '', i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    let j;
    if (c === '/' && n === '/') { j = src.indexOf('\n', i); j = j < 0 ? src.length : j; }
    else if (c === '/' && n === '*') { j = src.indexOf('*/', i + 2); j = j < 0 ? src.length : j + 2; }
    else if (c === '"' || c === "'" || c === '`') {
      j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; if (c !== '`' && src[j] === '\n') break; j++; }
      const closed = src[j] === c; // an unterminated quote (an apostrophe in JSX text) ends at the newline, kept
      o += c + blank(src.slice(i + 1, j)) + (closed ? c : ''); i = closed ? j + 1 : j; continue;
    } else { o += c; i++; continue; }
    o += blank(src.slice(i, j)); i = j;
  }
  return o;
}

// Index just past the bracket matching the one at `open`.
function matchClose(s, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [];
  for (let i = open; i < s.length; i++) {
    if (pairs[s[i]]) stack.push(pairs[s[i]]);
    else if (s[i] === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return i + 1; }
  }
  return s.length;
}

for (const root of roots) for (const f of walk(root)) {
  const raw = readFileSync(f, 'utf8'), m = mask(raw), lines = raw.split('\n');
  const lineOf = (idx) => m.slice(0, idx).split('\n').length;
  const add = (level, rule, idx, msg) => {
    const ln = lineOf(idx);
    out.push({ level, rule, where: `${relative(process.cwd(), f)}:${ln}`, msg, text: lines[ln - 1].trim().slice(0, 110) });
  };

  for (const e of m.matchAll(/\buse(?:Layout|Insertion)?Effect\s*\(\s*(async\s+)?(\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>\s*/g)) {
    const at = e.index + e[0].length;
    if (m[at] !== '{') { add('error', 'effect-expression-body', e.index, 'the expression becomes the cleanup; React calls it on unmount/re-run (a Promise from scrollTo blanked an app)'); continue; }
    if (e[1]) add('error', 'effect-async', e.index, 'async callback returns a Promise as cleanup; call an inner async function instead');
    const body = m.slice(at, matchClose(m, at));
    const returns = /\breturn\b/.test(body);
    if (!returns && /addEventListener|setInterval|setTimeout|requestAnimationFrame|\.subscribe\(|\.on\(|new\s+(Resize|Intersection|Mutation)Observer|new\s+(WebSocket|EventSource|BroadcastChannel)/.test(body))
      add('warn', 'effect-no-cleanup', e.index, 'subscribes/schedules but returns no cleanup');
    if (/\bfetch\(|\.then\(|\bawait\b/.test(body) && !/AbortController|signal|cancel|ignore|stale|alive|live|active|mounted|current\s*!==/.test(body))
      add('warn', 'effect-fetch-race', e.index, 'async result is applied without a cancel/ignore guard; a fast param change can show stale data');
  }

  for (const e of m.matchAll(/\.map\(\s*(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>\s*/g)) {
    let at = e.index + e[0].length;
    if (m[at] === '{') { const r = /\breturn\s*\(?\s*</.exec(m.slice(at, matchClose(m, at))); if (!r) continue; at += r.index + r[0].length - 1; }
    else { const r = /^\(?\s*</.exec(m.slice(at)); if (!r) continue; at += r[0].length - 1; }
    let d = 0, k = at + 1;
    for (; k < m.length; k++) { if (m[k] === '{') d++; else if (m[k] === '}') d--; else if (m[k] === '>' && d === 0 && m[k - 1] !== '=') break; }
    const tag = m.slice(at, k + 1);
    if (/^<>/.test(tag)) add('error', 'list-fragment-no-key', at, 'short fragment in a list cannot take a key; use <Fragment key=…>');
    else if (!/\bkey\s*=/.test(tag)) add('error', 'list-missing-key', at, 'list element without a key');
    else if (/\bkey\s*=\s*\{\s*(i|idx|index)\s*\}/.test(tag)) add('info', 'list-index-key', at, 'index key: wrong state/DOM reuse if items reorder or are filtered');
  }

  for (const e of m.matchAll(/\buseState\(\s*(props\.[\w$.]+|[a-z_$][\w$]*(?:\.[\w$]+)+)\s*\)/g))
    add('info', 'state-from-prop', e.index, 'state seeded from a prop/param is not reset when it changes; key the component by the param or derive instead');
  for (const e of raw.matchAll(/eslint-disable[^\n]*exhaustive-deps/g)) add('warn', 'deps-suppressed', e.index, 'suppressed exhaustive-deps; check for stale closures');
  for (const e of raw.matchAll(/dangerouslySetInnerHTML/g)) add('warn', 'inner-html', e.index, 'raw HTML; confirm the source is trusted or sanitised');
}

const order = { error: 0, warn: 1, info: 2 };
out.sort((a, b) => order[a.level] - order[b.level] || a.rule.localeCompare(b.rule));
const per = {};
for (const o of out) {
  per[o.rule] = (per[o.rule] ?? 0) + 1;
  if (per[o.rule] <= CAP) console.log(`${o.level.padEnd(5)} ${o.rule.padEnd(24)} ${o.where}  ${o.msg}\n      ${o.text}`);
}
for (const [r, n] of Object.entries(per)) if (n > CAP) console.log(`... ${n - CAP} more ${r}`);
const errors = out.filter((o) => o.level === 'error').length;
console.log(`react-check static: ${errors} error, ${out.length - errors} warn/info in ${roots.join(' ')}`);
process.exit(errors ? 1 : 0);
