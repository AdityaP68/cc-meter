import type {
  CompactionEvent,
  CostStateSnapshot,
  ParseOptions,
  ParsedTranscript,
  ParseStats,
  RawMessage,
  TranscriptParser,
} from './types.js';

/**
 * Parser for Claude Code 2.1.x transcripts (surveyed 2.1.236 .. 2.1.295, see docs/FORMATS.md).
 * Everything format-specific lives in this file. Unknown entry types and usage keys are counted, never fatal.
 */

/** Entry types we read. */
const PROCESSED_TYPES = new Set(['user', 'assistant', 'system', 'cost-state']);
/** Entry types known to exist that carry nothing ccmeter needs. */
const IGNORED_TYPES = new Set([
  'mode',
  'permission-mode',
  'atis-latch',
  'file-history-snapshot',
  'file-history-delta',
  'attachment',
  'last-prompt',
  'queue-operation',
  'custom-title',
  'agent-name',
  'ai-title',
  'bridge-session',
  'frame-link',
  'artifact-comment-monitor',
  'artifact-autoreact-ledger',
]);
const KNOWN_USAGE_KEYS = new Set([
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'output_tokens_details',
  'server_tool_use',
  'service_tier',
  'cache_creation',
  'inference_geo',
  'iterations',
  'speed',
  'fallback_credit',
]);
/** User entries whose string content starts with one of these are harness-generated, not prompts. */
const NON_PROMPT_PREFIXES = [
  '<command-name>',
  '<command-message>',
  '<local-command',
  '<task-notification',
  '<system-reminder',
  '<bash-input>',
  '<bash-stdout>',
  '<user-prompt-submit-hook>',
];

type Json = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const inc = (m: Record<string, number>, k: string) => {
  m[k] = (m[k] ?? 0) + 1;
};

export function isRealPrompt(o: Json): boolean {
  if (o.isSidechain || o.isMeta || o.isCompactSummary || o.promptSource === 'system') return false;
  const content = (o.message as Json | undefined)?.content;
  if (typeof content === 'string') {
    const head = content.trimStart();
    return head.length > 0 && !NON_PROMPT_PREFIXES.some((p) => head.startsWith(p));
  }
  if (Array.isArray(content)) {
    return content.some((b) => b && typeof b === 'object' && (b as Json).type === 'text');
  }
  return false;
}

function emptyStats(): ParseStats {
  return {
    lines: 0,
    blank: 0,
    unparsable: 0,
    entriesByType: {},
    unknownTypes: {},
    syntheticIgnored: 0,
    duplicatesCollapsed: 0,
    assistantWithoutUsage: 0,
    assistantWithoutId: 0,
    classifierRequests: 0,
    unknownUsageKeys: {},
  };
}

function parse(lines: string[], opts: ParseOptions = {}): ParsedTranscript {
  const stats = emptyStats();
  const byId = new Map<string, RawMessage>();
  const compactions: CompactionEvent[] = [];
  const turns: { index: number; ts: string }[] = [];
  const versions = new Set<string>();
  const entrypoints = new Set<string>();
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let customTitle: string | null = null;
  let aiTitle: string | null = null;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let costState: CostStateSnapshot | null = null;
  let turn = 0;

  lines.forEach((line, order) => {
    stats.lines++;
    if (!line || !line.trim()) {
      stats.blank++;
      return;
    }
    let o: Json;
    try {
      const v = JSON.parse(line);
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
      o = v as Json;
    } catch {
      stats.unparsable++;
      return;
    }
    const type = str(o.type) ?? '(none)';
    inc(stats.entriesByType, type);
    if (!PROCESSED_TYPES.has(type) && !IGNORED_TYPES.has(type)) inc(stats.unknownTypes, type);

    const v = str(o.version);
    if (v) versions.add(v);
    const ep = str(o.entrypoint);
    if (ep) entrypoints.add(ep);
    sessionId ??= str(o.sessionId);
    cwd ??= str(o.cwd);
    gitBranch ??= str(o.gitBranch);

    if (type === 'custom-title') customTitle = str(o.customTitle) ?? customTitle;
    else if (type === 'ai-title') aiTitle = str(o.aiTitle) ?? str(o.title) ?? aiTitle;
    else if (type === 'cost-state') costState = readCostState(o) ?? costState;

    const ts = str(o.timestamp);
    if (ts && (type === 'user' || type === 'assistant' || type === 'system')) {
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;
    }

    if (type === 'user') {
      if (!opts.subagent && isRealPrompt(o)) {
        turn++;
        turns.push({ index: turn, ts: ts ?? '' });
      }
    } else if (type === 'system') {
      if (o.subtype === 'compact_boundary') {
        const m = (o.compactMetadata ?? {}) as Json;
        compactions.push({
          ts: ts ?? '',
          trigger: str(m.trigger),
          preTokens: typeof m.preTokens === 'number' ? m.preTokens : null,
          postTokens: typeof m.postTokens === 'number' ? m.postTokens : null,
          turn,
        });
      }
    } else if (type === 'assistant') {
      readAssistant(o, order, ts, turn, opts, stats, byId);
    }
  });

  const title = customTitle ?? aiTitle;
  const messages = [...byId.values()].sort((a, b) => a.order - b.order);
  return {
    parserId: PARSER_ID,
    messages,
    compactions,
    turns,
    meta: {
      sessionId,
      cwd,
      gitBranch,
      versions: [...versions],
      entrypoints: [...entrypoints],
      title,
      firstTs,
      lastTs,
    },
    costState,
    stats,
  };
}

function readAssistant(
  o: Json,
  order: number,
  ts: string | null,
  turn: number,
  opts: ParseOptions,
  stats: ParseStats,
  byId: Map<string, RawMessage>,
): void {
  const msg = (o.message ?? {}) as Json;
  const model = str(msg.model);
  if (str(o.serverClassifierRequest)) stats.classifierRequests++;
  if (model === '<synthetic>' || o.isApiErrorMessage) {
    stats.syntheticIgnored++;
    return;
  }
  const usage = msg.usage as Json | undefined;
  if (!usage || typeof usage !== 'object' || !model) {
    stats.assistantWithoutUsage++;
    return;
  }
  for (const k of Object.keys(usage)) if (!KNOWN_USAGE_KEYS.has(k)) inc(stats.unknownUsageKeys, k);

  let id = str(msg.id);
  if (!id) {
    stats.assistantWithoutId++;
    id = str(o.requestId) ?? str(o.uuid) ?? `line-${order}`;
  }
  const cacheWrite = num(usage.cache_creation_input_tokens);
  const cc = (usage.cache_creation ?? {}) as Json;
  const cacheWrite1h = Math.min(cacheWrite, num(cc.ephemeral_1h_input_tokens));
  const sidechain = o.isSidechain === true || !!opts.subagent;

  const rec: RawMessage = {
    id,
    ts: ts ?? '',
    model,
    input: num(usage.input_tokens),
    output: num(usage.output_tokens),
    cacheWrite,
    cacheWrite1h,
    cacheRead: num(usage.cache_read_input_tokens),
    webSearch: num(((usage.server_tool_use ?? {}) as Json).web_search_requests),
    speed: str(usage.speed),
    stopReason: str(msg.stop_reason),
    sidechain,
    agentId: str(o.agentId) ?? (sidechain ? (opts.agentIdFromFile ?? null) : null),
    requestId: str(o.requestId),
    turn,
    order,
  };
  // Streaming writes one entry per content block with the same message id; keep the last.
  if (byId.has(id)) stats.duplicatesCollapsed++;
  byId.set(id, rec);
}

function readCostState(o: Json): CostStateSnapshot | null {
  if (typeof o.totalCostUSD !== 'number') return null;
  const modelUsage: CostStateSnapshot['modelUsage'] = {};
  const usage = o.modelUsage;
  const entries = typeof usage === 'object' && usage !== null && !Array.isArray(usage) ? Object.entries(usage as Record<string, unknown>) : [];
  for (const [m, rawEntry] of entries) {
    if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) continue;
    const raw = rawEntry as Json;
    modelUsage[m] = {
      inputTokens: num(raw.inputTokens),
      outputTokens: num(raw.outputTokens),
      cacheReadInputTokens: num(raw.cacheReadInputTokens),
      cacheCreationInputTokens: num(raw.cacheCreationInputTokens),
      costUSD: typeof raw.costUSD === 'number' ? raw.costUSD : 0,
      webSearchRequests: num(raw.webSearchRequests),
    };
  }
  return { totalCostUSD: o.totalCostUSD, modelUsage };
}

export const PARSER_ID = 'cc-2.1';

export const cc21: TranscriptParser = {
  id: PARSER_ID,
  verifiedRange: ['2.1.236', '2.1.295'],
  handles: (version) => /^2\.1\./.test(version),
  parse,
};
