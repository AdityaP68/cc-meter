import fs from 'node:fs';
import path from 'node:path';
import { openDb, type Db } from '../../core/db.js';
import { loadPricing } from '../../core/pricing.js';
import { recordTranscript } from '../../core/record.js';
import { asst, tmpDir, user } from './util.js';

export const SENTINEL_OUTPUT = 'TOOLOUTPUT-SENTINEL-9f3a';
export const SENTINEL_INPUT = 'FILECONTENT-SENTINEL-77c1';
// assembled at runtime so the repo's secret scan does not see a key-shaped literal
export const SENTINEL_SECRET = ['sk', 'ant', 'api03', 'SECRETSECRETSECRET'].join('-');

const T = (n: number) => `2026-02-01T10:${String(n).padStart(2, '0')}:00.000Z`;

/** An assistant message whose content is the given blocks (tool_use blocks carry their input). */
export function asstBlocks(
  o: Parameters<typeof asst>[0],
  blocks: { name: string; input?: unknown; id?: string }[],
): string {
  const j = JSON.parse(asst(o));
  j.message.content = blocks.map((b, i) => ({ type: 'tool_use', id: b.id ?? `${o.id}-t${i}`, name: b.name, input: b.input ?? {}, caller: { type: 'direct' } }));
  return JSON.stringify(j);
}

export function toolResult(toolUseId: string, o: { error?: boolean | undefined; ts: string; denial?: string }): string {
  const block: Record<string, unknown> = { type: 'tool_result', tool_use_id: toolUseId, content: `${SENTINEL_OUTPUT} output text` };
  if (o.error !== undefined) block.is_error = o.error;
  return user([block], o.ts, o.denial ? { toolDenialKind: o.denial } : {});
}

/**
 * A synthetic session with: a read+edit turn; a correction turn with a retry loop (4 identical failing Bash calls), a
 * subagent call and a compaction; a final turn on another model with a denied tool call. Tokens and models are chosen so
 * that costs are exact: sonnet-5-5 $2/$10 per M.
 */
export function syntheticLines(): string[] {
  const bash = { command: `make test ${SENTINEL_INPUT}` };
  const L: string[] = [];
  L.push(user(`Add a retry to the fetch client. my key is ${SENTINEL_SECRET}`, T(0)));
  L.push(asstBlocks({ id: 'm1', ts: T(1), input: 1000, output: 100, stop: 'tool_use' }, [{ name: 'Read', input: { file_path: '/x.ts' }, id: 'r1' }, { name: 'Edit', input: { file_path: '/x.ts', new_string: SENTINEL_INPUT }, id: 'e1' }]));
  L.push(toolResult('r1', { ts: T(2) }));
  L.push(toolResult('e1', { ts: T(2), error: false }));
  L.push(asst({ id: 'm2', ts: T(3), input: 1000, output: 200, stop: 'end_turn' }));
  L.push(user("No, that's wrong. I said use exponential backoff", T(4)));
  L.push(asstBlocks({ id: 'm3', ts: T(5), input: 2000, output: 100, stop: 'tool_use' }, [
    { name: 'Bash', input: bash, id: 'b1' }, { name: 'Bash', input: bash, id: 'b2' }, { name: 'Bash', input: bash, id: 'b3' }, { name: 'Bash', input: bash, id: 'b4' },
    { name: 'Agent', input: { prompt: SENTINEL_INPUT }, id: 'a1' },
  ]));
  for (const id of ['b1', 'b2', 'b3']) L.push(toolResult(id, { ts: T(6), error: true }));
  L.push(toolResult('b4', { ts: T(6), error: false }));
  L.push(asst({ id: 'sub1', ts: T(6), input: 500, output: 50, stop: 'end_turn', sidechain: true, agentId: 'ag1' }));
  L.push(toolResult('a1', { ts: T(7) }));
  L.push(asst({ id: 'm4', ts: T(8), input: 2500, output: 300, stop: 'end_turn' }));
  L.push(JSON.stringify({ type: 'system', subtype: 'compact_boundary', timestamp: T(9), sessionId: 's1', version: '2.1.287', cwd: '/work/proj', compactMetadata: { trigger: 'auto', preTokens: 150000, postTokens: 9000 } }));
  L.push(user('ok run the tests', T(10)));
  L.push(asstBlocks({ id: 'm5', ts: T(11), model: 'claude-haiku-4-5', input: 3000, output: 100, stop: 'tool_use' }, [{ name: 'Bash', input: { command: 'npm test' }, id: 'b5' }]));
  L.push(toolResult('b5', { ts: T(12), error: true, denial: 'permission-rule' }));
  L.push(asst({ id: 'm6', ts: T(13), model: 'claude-haiku-4-5', input: 3000, output: 100, stop: 'end_turn' }));
  return L;
}

export interface Synthetic {
  claude: string;
  home: string;
  db: Db;
  sessionId: string;
  transcript: string;
}

/** Write the synthetic transcript into a fake ~/.claude, record it into a fresh DB under a temp CCMETER_HOME. */
export function recordSynthetic(lines: string[] = syntheticLines(), sessionId = 'synthetic-0001'): Synthetic {
  const claude = tmpDir('claude-');
  const home = tmpDir('home-');
  const dir = path.join(claude, 'projects', '-work-proj');
  fs.mkdirSync(dir, { recursive: true });
  const transcript = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(transcript, lines.join('\n') + '\n');
  const db = openDb(path.join(home, 'ccmeter.db'));
  const r = recordTranscript(db, loadPricing(), transcript);
  if (r.status !== 'recorded') throw new Error(`synthetic session not recorded: ${r.status}`);
  return { claude, home, db, sessionId, transcript };
}
