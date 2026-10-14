import path from 'node:path';
import type { ParserStatus } from './parser/index.js';
import type { CostStateSnapshot, ParsedTranscript, ParseStats, RawMessage } from './parser/types.js';
import { messageCost, type PriceTable } from './pricing.js';

export interface SessionMessage extends RawMessage {
  /** USD, or null when the model is unpriced (never 0). */
  cost: number | null;
}

export interface SwitchEvent {
  ts: string;
  from: string;
  to: string;
  turn: number;
  messageId: string;
}

export interface ModelTotals {
  model: string;
  messages: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  /** Cost of priced messages only. */
  cost: number;
  unpriced: boolean;
}

export interface Tokens {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface SessionSummary {
  sessionId: string;
  source: string;
  cwd: string | null;
  project: string | null;
  title: string | null;
  transcriptPath: string;
  ccVersions: string[];
  parserId: string;
  parserStatus: ParserStatus;
  entrypoint: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  turns: number;
  messageCount: number;
  sidechainMessageCount: number;
  /**
   * Messages whose final transcript entry has stop_reason null: an unfinalized streaming snapshot. Their output_tokens are a
   * lower bound (79% of subagent messages in the surveyed data; 0% of main-thread messages). See docs/FORMATS.md.
   */
  partialMessages: number;
  tokens: Tokens;
  /** Subset of `tokens` that came from subagents (sidechains). */
  sidechainTokens: Tokens;
  costUsd: number;
  sidechainCostUsd: number;
  unpricedTokens: number;
  unpricedModels: string[];
  models: ModelTotals[];
  switches: SwitchEvent[];
  compactions: ParsedTranscript['compactions'];
  /** Claude Code's own accounting from the transcript, for cross-checking. */
  costState: CostStateSnapshot | null;
  messages: SessionMessage[];
  stats: ParseStats;
}

export interface BuildOptions {
  table: PriceTable;
  source: string;
  transcriptPath: string;
  sessionId: string;
  parserStatus: ParserStatus;
}

const zero = (): Tokens => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
const addTo = (t: Tokens, m: RawMessage) => {
  t.input += m.input;
  t.output += m.output;
  t.cacheWrite += m.cacheWrite;
  t.cacheRead += m.cacheRead;
};
export const totalTokens = (t: Tokens) => t.input + t.output + t.cacheWrite + t.cacheRead;

function mergeStats(all: ParseStats[]): ParseStats {
  const out: ParseStats = {
    lines: 0,
    blank: 0,
    unparsable: 0,
    entriesByType: {},
    unknownTypes: {},
    syntheticIgnored: 0,
    duplicatesCollapsed: 0,
    assistantWithoutUsage: 0,
    assistantWithoutId: 0,
    unknownUsageKeys: {},
  };
  for (const s of all) {
    out.lines += s.lines;
    out.blank += s.blank;
    out.unparsable += s.unparsable;
    out.syntheticIgnored += s.syntheticIgnored;
    out.duplicatesCollapsed += s.duplicatesCollapsed;
    out.assistantWithoutUsage += s.assistantWithoutUsage;
    out.assistantWithoutId += s.assistantWithoutId;
    for (const k of ['entriesByType', 'unknownTypes', 'unknownUsageKeys'] as const)
      for (const [name, n] of Object.entries(s[k])) out[k][name] = (out[k][name] ?? 0) + n;
  }
  return out;
}

/** Map a timestamp to the user turn it falls in (turns are ordered by time). */
function turnAt(turns: { index: number; ts: string }[], ts: string): number {
  let lo = 0;
  let hi = turns.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((turns[mid]!.ts || '') <= ts) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? 0 : turns[lo - 1]!.index;
}

export function buildSession(main: ParsedTranscript, subs: ParsedTranscript[], o: BuildOptions): SessionSummary {
  const messages: SessionMessage[] = [];
  const seen = new Set<string>();
  const push = (m: RawMessage, turn: number) => {
    if (seen.has(m.id)) return; // a message id is billed once, wherever it shows up
    seen.add(m.id);
    messages.push({ ...m, turn, cost: messageCost(o.table, m) });
  };
  for (const m of main.messages) push(m, m.turn);
  for (const s of subs) for (const m of s.messages) push(m, turnAt(main.turns, m.ts));
  messages.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0) || a.order - b.order);

  // Model switches: consecutive main-chain assistant messages with different models.
  // Sidechain (subagent) messages are excluded: a subagent on another model is not a user-visible switch.
  const switches: SwitchEvent[] = [];
  let prev: SessionMessage | null = null;
  for (const m of messages) {
    if (m.sidechain) continue;
    if (prev && prev.model !== m.model)
      switches.push({ ts: m.ts, from: prev.model, to: m.model, turn: m.turn, messageId: m.id });
    prev = m;
  }

  const tokens = zero();
  const sidechainTokens = zero();
  let costUsd = 0;
  let sidechainCostUsd = 0;
  let unpricedTokens = 0;
  const byModel = new Map<string, ModelTotals>();
  for (const m of messages) {
    addTo(tokens, m);
    if (m.sidechain) addTo(sidechainTokens, m);
    const t =
      byModel.get(m.model) ??
      ({ model: m.model, messages: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0, unpriced: false } as ModelTotals);
    t.messages++;
    t.input += m.input;
    t.output += m.output;
    t.cacheWrite += m.cacheWrite;
    t.cacheRead += m.cacheRead;
    if (m.cost === null) {
      t.unpriced = true;
      unpricedTokens += m.input + m.output + m.cacheWrite + m.cacheRead;
    } else {
      t.cost += m.cost;
      costUsd += m.cost;
      if (m.sidechain) sidechainCostUsd += m.cost;
    }
    byModel.set(m.model, t);
  }
  const models = [...byModel.values()].sort((a, b) => b.cost - a.cost || b.messages - a.messages);

  const versions = new Set<string>(main.meta.versions);
  for (const s of subs) for (const v of s.meta.versions) versions.add(v);
  const startedAt = main.meta.firstTs ?? messages[0]?.ts ?? null;
  const endedAt = [main.meta.lastTs, messages.at(-1)?.ts].filter(Boolean).sort().at(-1) ?? null;
  const cwd = main.meta.cwd;

  return {
    sessionId: o.sessionId,
    source: o.source,
    cwd,
    project: cwd ? path.basename(cwd) || cwd : null,
    title: main.meta.title,
    transcriptPath: o.transcriptPath,
    ccVersions: [...versions].sort(),
    parserId: main.parserId,
    parserStatus: o.parserStatus,
    entrypoint: main.meta.entrypoints[0] ?? null,
    startedAt,
    endedAt,
    durationMs: startedAt && endedAt ? Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)) : null,
    turns: main.turns.length,
    messageCount: messages.length,
    sidechainMessageCount: messages.filter((m) => m.sidechain).length,
    partialMessages: messages.filter((m) => m.stopReason === null).length,
    tokens,
    sidechainTokens,
    costUsd,
    sidechainCostUsd,
    unpricedTokens,
    unpricedModels: models.filter((m) => m.unpriced).map((m) => m.model),
    models,
    switches,
    compactions: main.compactions,
    costState: main.costState,
    messages,
    stats: mergeStats([main.stats, ...subs.map((s) => s.stats)]),
  };
}
