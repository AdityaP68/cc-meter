import crypto from 'node:crypto';
import type { Db } from './db.js';
import { readLines } from './jsonl.js';
import { extractTurnDetail, type TurnDetail } from './parser/cc21-detail.js';
import type { PriceTable } from './pricing.js';
import { parseSession } from './record.js';
import { redact } from './redact.js';

/**
 * A deterministic, zero-token digest of one recorded session (docs/ARCHITECTURE.md, Milestone 3 §1). It is built in memory
 * from the transcript and the DB row and is never persisted. It holds counts, ids and model names, plus the user's own
 * prompts: capped in length and redacted. It holds NO tool output, NO tool input, NO file contents, NO assistant text, and
 * nothing that identifies a person or a place (no session id, cwd, project, title or timestamps).
 */
export const DIGEST_VERSION = 1;
export const DEFAULT_PROMPT_CAP = 500;
export const DEFAULT_MAX_PROMPT_TURNS = 80;
export const DEFAULT_HEAD_TURNS = 20;

export interface DigestTurn {
  turn: number;
  prompt: { text: string | null; chars: number; truncated: boolean };
  messages: number;
  subagent_messages: number;
  models: string[];
  /** Sum of the priced messages; null when every message of the turn is unpriced (never 0). */
  cost_usd: number | null;
  unpriced_messages: number;
  tokens: { input: number; output: number; cache_write: number; cache_read: number };
  tools: Record<string, number>;
  tool_errors: Record<string, number>;
  /** User entries that carried `toolDenialKind`, by kind (docs/FORMATS.md). */
  denials: Record<string, number>;
  subagent_calls: number;
  /** Tools called with an identical input at least twice in this turn: the highest count. */
  repeats: Record<string, number>;
  outcome: { ended: string | null; has_tool_errors: boolean; denied_or_interrupted: boolean };
}

export type DigestEvent =
  | { kind: 'model_switch'; turn: number; from: string; to: string }
  | { kind: 'compaction'; turn: number; trigger: string | null; pre_tokens: number | null; post_tokens: number | null };

export interface Digest {
  digest_version: number;
  session: {
    turns: number;
    messages: number;
    subagent_messages: number;
    duration_ms: number | null;
    cc_versions: string[];
    models: string[];
    cost_usd: number | null;
    unpriced_messages: number;
  };
  turns: DigestTurn[];
  events: DigestEvent[];
  omitted_prompt_turns: number;
}

export interface DigestOptions {
  table: PriceTable;
  /** Characters of each prompt kept. */
  promptCap?: number;
  /** Prompts of at most this many turns are kept; beyond it the middle turns keep their numbers but not their text. */
  maxPromptTurns?: number;
  /** When turns exceed maxPromptTurns, this many leading turns keep their prompts (the rest of the budget is the tail). */
  headTurns?: number;
}

export interface BuiltDigest {
  digest: Digest;
  hash: string;
}

const round = (n: number) => Math.round(n * 1e9) / 1e9;
const sortKeys = <T>(m: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/**
 * sha256 of the canonical JSON. Cost fields are left out of the hash so a price-table update does not make a paid review
 * look new; tokens, prompts, tools and events are in it, so any change to the session does.
 */
export function digestHash(d: Digest): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'cost_usd').map(([k, x]) => [k, strip(x)]));
    return v;
  };
  return crypto.createHash('sha256').update(canonical(strip(d))).digest('hex');
}

export function buildDigest(db: Db, sessionId: string, o: DigestOptions): BuiltDigest {
  const row = db.prepare('SELECT transcript_path FROM sessions WHERE session_id = ?').get(sessionId) as { transcript_path: string } | undefined;
  if (!row) throw new Error(`no recorded session "${sessionId}" (try \`ccmeter record --all\`)`);
  const summary = parseSession(row.transcript_path, o.table);
  if (!summary) throw new Error(`cannot read the transcript of session "${sessionId}"`);
  const detail = new Map<number, TurnDetail>(extractTurnDetail(readLines(row.transcript_path)).map((t) => [t.turn, t]));

  const cap = o.promptCap ?? DEFAULT_PROMPT_CAP;
  const maxPrompts = o.maxPromptTurns ?? DEFAULT_MAX_PROMPT_TURNS;
  const head = Math.min(o.headTurns ?? DEFAULT_HEAD_TURNS, maxPrompts);
  const total = summary.turns;
  const keepPrompt = (n: number) => total <= maxPrompts || n <= head || n > total - (maxPrompts - head);

  const turnNumbers = new Set<number>([...detail.keys(), ...summary.messages.map((m) => m.turn)]);
  turnNumbers.delete(0); // anything before the first prompt (no user turn) carries no prompt to review
  let omitted = 0;
  const turns: DigestTurn[] = [...turnNumbers]
    .sort((a, b) => a - b)
    .map((n) => {
      const d = detail.get(n);
      const msgs = summary.messages.filter((m) => m.turn === n);
      const main = msgs.filter((m) => !m.sidechain);
      const priced = msgs.filter((m) => m.cost !== null);
      const text = d?.promptText ?? '';
      const kept = keepPrompt(n);
      if (!kept) omitted++;
      const redacted = redact(text);
      const sliced = redacted.length > cap ? redacted.slice(0, cap) : redacted;
      const errors = Object.values(d?.toolErrors ?? {}).reduce((a, b) => a + b, 0);
      const denials = d?.denials ?? {};
      return {
        turn: n,
        prompt: { text: kept ? sliced : null, chars: text.length, truncated: kept && redacted.length > cap },
        messages: msgs.length,
        subagent_messages: msgs.length - main.length,
        models: [...new Set(msgs.map((m) => m.model))].sort(),
        cost_usd: priced.length ? round(priced.reduce((a, m) => a + (m.cost ?? 0), 0)) : null,
        unpriced_messages: msgs.length - priced.length,
        tokens: {
          input: msgs.reduce((a, m) => a + m.input, 0),
          output: msgs.reduce((a, m) => a + m.output, 0),
          cache_write: msgs.reduce((a, m) => a + m.cacheWrite, 0),
          cache_read: msgs.reduce((a, m) => a + m.cacheRead, 0),
        },
        tools: sortKeys(d?.toolCalls ?? {}),
        tool_errors: sortKeys(d?.toolErrors ?? {}),
        denials: sortKeys(denials),
        subagent_calls: d?.subagentCalls ?? 0,
        repeats: sortKeys(d?.repeats ?? {}),
        outcome: {
          ended: main.at(-1)?.stopReason ?? null,
          has_tool_errors: errors > 0,
          denied_or_interrupted: Object.keys(denials).some((k) => k === 'user-rejected' || k === 'interrupted'),
        },
      };
    });

  const events: DigestEvent[] = [
    ...summary.switches.map((s) => ({ ts: s.ts, e: { kind: 'model_switch' as const, turn: s.turn, from: s.from, to: s.to } })),
    ...summary.compactions.map((c) => ({ ts: c.ts, e: { kind: 'compaction' as const, turn: c.turn, trigger: c.trigger, pre_tokens: c.preTokens, post_tokens: c.postTokens } })),
  ]
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
    .map((x) => x.e);

  const allPriced = summary.messages.filter((m) => m.cost !== null);
  const digest: Digest = {
    digest_version: DIGEST_VERSION,
    session: {
      turns: total,
      messages: summary.messageCount,
      subagent_messages: summary.sidechainMessageCount,
      duration_ms: summary.durationMs,
      cc_versions: summary.ccVersions,
      models: summary.models.map((m) => m.model).sort(),
      cost_usd: allPriced.length ? round(summary.costUsd) : null,
      unpriced_messages: summary.messageCount - allPriced.length,
    },
    turns,
    events,
    omitted_prompt_turns: omitted,
  };
  return { digest, hash: digestHash(digest) };
}
