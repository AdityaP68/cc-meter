import fs from 'node:fs';
import path from 'node:path';
import { tmpDir } from './util.js';

/**
 * A stand-in for the `claude` executable. It never contacts anything: it reads the prompt from stdin, logs what it was
 * called with, and prints the JSON shape observed from a real `claude -p --output-format json --json-schema` run
 * (docs/FORMATS.md). STUB_MODE: ok | invalid | quote | error | garbage | notjson | slow. It also writes a small judge transcript
 * under $CLAUDE_CONFIG_DIR/projects/-judge/ like a real run would.
 */
const SCRIPT = `#!${process.execPath}
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  const mode = process.env.STUB_MODE || 'ok';
  const arg = (n) => args[args.indexOf(n) + 1];
  fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ args, stdin, judgeEnv: process.env.CCMETER_JUDGE_RUNNING, cwd: process.cwd() }) + '\\n');
  if (mode === 'slow') return setTimeout(() => {}, 60000);
  if (mode === 'garbage') { process.stdout.write('this is not json'); return process.exit(0); }
  if (mode === 'error') {
    process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Not logged in', terminal_reason: 'api_error', total_cost_usd: 0 }));
    return process.exit(1);
  }
  const m = /<digest>\\n([\\s\\S]*?)\\n<\\/digest>/.exec(stdin);
  const digest = JSON.parse(m[1]);
  const model = arg('--model');
  const scores = digest.turns.filter((t) => t.prompt.text !== null).map((t) => ({
    turn: t.turn, clarity: 4, context: 3, scope: 5, verifiability: mode === 'invalid' ? 9 : 2,
    note: mode === 'quote' ? 'The user wrote: ' + t.prompt.text : 'Clear request, little context.',
    suggestion: 'Say how to check the result.',
  }));
  const payload = { summary: { goal: 'Add retry handling to a client', outcome: 'partly_achieved', decisions: ['use backoff'], open_issues: ['tests failed'] }, prompt_scores: scores };
  const sid = 'judge-' + Math.random().toString(16).slice(2, 10) + '-0000-4000-8000-000000000000';
  const dir = path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', '-judge');
  fs.mkdirSync(dir, { recursive: true });
  const ts = '2026-02-02T09:00:00.000Z';
  const base = { isSidechain: false, sessionId: sid, version: '2.1.302', cwd: process.cwd(), timestamp: ts };
  fs.writeFileSync(path.join(dir, sid + '.jsonl'), [
    JSON.stringify({ ...base, type: 'user', uuid: 'u1', parentUuid: null, message: { role: 'user', content: 'review prompt' } }),
    JSON.stringify({ ...base, type: 'assistant', uuid: 'a1', message: { id: 'msg_' + sid, model, role: 'assistant', type: 'message', content: [{ type: 'text', text: 'x' }], stop_reason: 'end_turn',
      usage: { input_tokens: 2, output_tokens: 300, cache_creation_input_tokens: 5000, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 5000 } } } }),
  ].join('\\n') + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, session_id: sid, num_turns: 2, terminal_reason: 'completed',
    result: mode === 'notjson' ? JSON.stringify(payload) : '',
    ...(mode === 'notjson' ? {} : { structured_output: payload }),
    total_cost_usd: 0.0123,
    usage: { input_tokens: 2, cache_creation_input_tokens: 5000, cache_read_input_tokens: 0, output_tokens: 300 },
    modelUsage: { [model]: { inputTokens: 2, outputTokens: 300, cacheReadInputTokens: 0, cacheCreationInputTokens: 5000, costUSD: 0.0123 } },
  }));
});
`;

export interface Stub {
  bin: string;
  log: string;
  calls: () => { args: string[]; stdin: string; judgeEnv?: string; cwd: string }[];
}

export function makeStubClaude(): Stub {
  const dir = tmpDir('stub-claude-');
  const bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, SCRIPT, { mode: 0o755 });
  const log = path.join(dir, 'calls.jsonl');
  fs.writeFileSync(log, '');
  return {
    bin,
    log,
    calls: () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
  };
}
