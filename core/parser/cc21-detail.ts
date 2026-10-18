import crypto from 'node:crypto';
import { isRealPrompt } from './cc21.js';

/**
 * Per-turn detail the usage parser does not keep, read from the same Claude Code 2.1.x transcripts for the reviewer's digest.
 * Format facts (docs/FORMATS.md, "Tool blocks"): assistant `content` holds `tool_use` blocks {id, name, input}; the matching
 * `tool_result` block {tool_use_id, is_error?, content} sits in a later non-prompt `user` entry; a denied or interrupted call
 * puts `toolDenialKind` on that user entry. Tool *output* (`content`) and tool *input* values are never returned: input is
 * reduced to a short opaque fingerprint, only to see that the same call was repeated.
 */
export interface TurnDetail {
  turn: number;
  /** Prompt text as written (uncapped, unredacted): the digest builder caps and redacts it. Empty for turn 0. */
  promptText: string;
  toolCalls: Record<string, number>;
  /** tool_result blocks with is_error === true, by the name of the tool they answer. */
  toolErrors: Record<string, number>;
  /** Count of user entries carrying `toolDenialKind`, by kind. */
  denials: Record<string, number>;
  subagentCalls: number;
  /** Largest number of identical (tool, input) calls in this turn, only for tools called identically at least twice. */
  repeats: Record<string, number>;
}

/** Tool names that launch a subagent. `Agent` is observed (docs/FORMATS.md); `Task` is the older name and unverified. */
export const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const bump = (m: Record<string, number>, k: string, n = 1) => {
  m[k] = (m[k] ?? 0) + n;
};

/** Text blocks injected by Claude Code around a typed prompt (reminders, IDE context, command echoes) are not the user's words. */
const HARNESS_TAG = /^\s*<(system-reminder|command-name|command-message|local-command|task-notification|bash-input|bash-stdout|user-prompt-submit-hook|ide_)/;

function promptTextOf(o: Json): string {
  const content = (o.message as Json | undefined)?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b): b is Json => isObj(b) && b.type === 'text' && typeof b.text === 'string' && !HARNESS_TAG.test(b.text))
    .map((b) => b.text as string)
    .join('\n');
}

function fingerprint(name: string, input: unknown): string {
  const norm = JSON.stringify(input ?? null, (_k, v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v));
  return crypto.createHash('sha256').update(name).update('\0').update(norm).digest('hex').slice(0, 12);
}

export function extractTurnDetail(lines: string[]): TurnDetail[] {
  const turns = new Map<number, TurnDetail & { prints: Map<string, number> }>();
  const get = (n: number) => {
    let t = turns.get(n);
    if (!t) {
      t = { turn: n, promptText: '', toolCalls: {}, toolErrors: {}, denials: {}, subagentCalls: 0, repeats: {}, prints: new Map() };
      turns.set(n, t);
    }
    return t;
  };
  const uses = new Map<string, { turn: number; name: string }>();
  const seenUse = new Set<string>();
  let turn = 0;
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    let o: Json;
    try {
      const v = JSON.parse(line);
      if (!isObj(v)) continue;
      o = v;
    } catch {
      continue;
    }
    if (o.isSidechain === true) continue;
    const content = (o.message as Json | undefined)?.content;
    if (o.type === 'user') {
      if (isRealPrompt(o)) {
        turn++;
        get(turn).promptText = promptTextOf(o);
        continue;
      }
      if (typeof o.toolDenialKind === 'string') bump(get(turn).denials, o.toolDenialKind);
      if (!Array.isArray(content)) continue;
      for (const b of content) {
        if (!isObj(b) || b.type !== 'tool_result' || b.is_error !== true) continue;
        const use = typeof b.tool_use_id === 'string' ? uses.get(b.tool_use_id) : undefined;
        bump(get(use?.turn ?? turn).toolErrors, use?.name ?? '(unknown)');
      }
    } else if (o.type === 'assistant' && Array.isArray(content)) {
      for (const b of content) {
        if (!isObj(b) || b.type !== 'tool_use' || typeof b.name !== 'string') continue;
        const id = typeof b.id === 'string' ? b.id : null;
        if (id) {
          if (seenUse.has(id)) continue; // one transcript line per content block can repeat a block
          seenUse.add(id);
          uses.set(id, { turn, name: b.name });
        }
        const t = get(turn);
        bump(t.toolCalls, b.name);
        if (SUBAGENT_TOOLS.has(b.name)) t.subagentCalls++;
        const fp = fingerprint(b.name, b.input);
        t.prints.set(fp, (t.prints.get(fp) ?? 0) + 1);
        // remember which tool each fingerprint belongs to (the fingerprint already hashes the name)
        const prior = t.repeats[b.name] ?? 0;
        const n = t.prints.get(fp)!;
        if (n >= 2 && n > prior) t.repeats[b.name] = n;
      }
    }
  }
  return [...turns.values()].sort((a, b) => a.turn - b.turn).map(({ prints: _p, ...t }) => t);
}
