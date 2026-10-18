#!/usr/bin/env node
// Context guard (UserPromptSubmit + Stop hook), ported from the context-harness method (scripts/context_guard.py).
// Every request re-sends the whole context; on a 1M-token window Claude Code compacts far past the point where each
// request is expensive. This reads the last main-thread request's context size from the transcript and:
//  - UserPromptSubmit, >= WARN: adds a note (once per 100k band) to checkpoint, run the `handoff` skill and
//    recommend a fresh session;
//  - Stop, >= HANDOFF: blocks stopping once per session (exit 2) until the hand-off is written.
// State is per session in the temp dir and resets below WARN. Any error exits 0: a guard never breaks a session.
// Thresholds: CONTEXT_GUARD_WARN / CONTEXT_GUARD_HANDOFF.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const WARN = Number(process.env.CONTEXT_GUARD_WARN ?? 180_000);
export const HANDOFF = Number(process.env.CONTEXT_GUARD_HANDOFF ?? 300_000);
const BAND = 100_000;
const TAIL_BYTES = 1_000_000;
const STATE_DIR = path.join(os.tmpdir(), 'agent-lens-context-guard');

/** Context tokens of the most recent main-thread request, or null. Split on '\n' only (see docs/FORMATS.md). */
export function currentContext(transcript) {
  const fd = fs.openSync(transcript, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (o.type !== 'assistant' || o.isSidechain || o.message?.model === '<synthetic>') continue;
      const u = o.message?.usage ?? {};
      return (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    }
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/** Pure policy: { code, stdout, stderr, state }. */
export function decide(event, context, state, warn = WARN, handoff = HANDOFF) {
  if (context === null) return { code: 0, stdout: '', stderr: '', state };
  if (context < warn) return { code: 0, stdout: '', stderr: '', state: { warnedBands: [], handoffForced: false } };
  const k = `${Math.floor(context / 1000).toLocaleString('en-US')}k`;
  if (event === 'Stop' && context >= handoff && !state.handoffForced) {
    return {
      code: 2,
      stdout: '',
      stderr: `Context guard: this session's context is ~${k} tokens, above the ${handoff / 1000}k hand-off threshold, and every request re-sends all of it. Before stopping: run the \`handoff\` skill (rewrite \`## Next\` in docs/handoff.md for an agent with no memory of this conversation, then commit), and tell the user to start a fresh session and type 'resume'.`,
      state: { ...state, handoffForced: true },
    };
  }
  const band = Math.floor(context / BAND);
  if (event === 'UserPromptSubmit' && !state.warnedBands.includes(band)) {
    return {
      code: 0,
      stdout: `Context guard: this session's context is ~${k} tokens (warning at ${warn / 1000}k); every request re-sends it. Finish or checkpoint the current step, then run the \`handoff\` skill and recommend the user start a fresh session with 'resume'. Do not start unrelated new work in this session.`,
      stderr: '',
      state: { ...state, warnedBands: [...state.warnedBands, band] },
    };
  }
  return { code: 0, stdout: '', stderr: '', state };
}

function main() {
  try {
    const payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
    const event = payload.hook_event_name ?? '';
    const transcript = payload.transcript_path ?? '';
    if (!['UserPromptSubmit', 'Stop'].includes(event) || !transcript || !fs.existsSync(transcript)) return 0;
    const file = path.join(STATE_DIR, `${String(payload.session_id ?? 'unknown').replace(/[^\w-]/g, '_')}.json`);
    let state = { warnedBands: [], handoffForced: false };
    try {
      state = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      /* first time */
    }
    const r = decide(event, currentContext(transcript), state);
    if (JSON.stringify(r.state) !== JSON.stringify(state)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(r.state));
    }
    if (r.stdout) process.stdout.write(r.stdout + '\n');
    if (r.stderr) process.stderr.write(r.stderr + '\n');
    return r.code;
  } catch {
    return 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
