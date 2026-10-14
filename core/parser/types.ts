/** One deduplicated API message (streaming duplicates already collapsed, keep-last). */
export interface RawMessage {
  id: string;
  ts: string;
  model: string;
  input: number;
  output: number;
  /** Total cache-write tokens (5m + 1h). */
  cacheWrite: number;
  /** Portion of cacheWrite billed at the 1h-TTL rate. */
  cacheWrite1h: number;
  cacheRead: number;
  webSearch: number;
  /** usage.speed ("standard" | "fast" | null when absent). */
  speed: string | null;
  stopReason: string | null;
  /** True for subagent (sidechain) messages. They are never counted as user-visible model switches. */
  sidechain: boolean;
  agentId: string | null;
  requestId: string | null;
  /** Index of the user turn this message belongs to (0 = before the first prompt). */
  turn: number;
  /** Position in the source file; used for stable ordering. */
  order: number;
}

export interface CompactionEvent {
  ts: string;
  trigger: string | null;
  preTokens: number | null;
  postTokens: number | null;
  turn: number;
}

export interface CostStateModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
  webSearchRequests: number;
}

/** Claude Code's own accounting, written into the transcript as a `cost-state` entry. Used only for cross-checks. */
export interface CostStateSnapshot {
  totalCostUSD: number;
  modelUsage: Record<string, CostStateModelUsage>;
}

export interface ParseStats {
  lines: number;
  blank: number;
  /** Lines that were not valid JSON. */
  unparsable: number;
  entriesByType: Record<string, number>;
  /** Entry types the parser does not know about at all (possible format change). */
  unknownTypes: Record<string, number>;
  /** `<synthetic>` / API-error assistant messages ignored. */
  syntheticIgnored: number;
  /** Extra streaming copies dropped by message-id dedup. */
  duplicatesCollapsed: number;
  /** Assistant entries with no usable usage object. */
  assistantWithoutUsage: number;
  assistantWithoutId: number;
  /**
   * Assistant entries carrying a serverClassifierRequest id: a server-side classifier call happened for that message.
   * Such calls are not transcript messages; in the surveyed data, sessions with them are the ones where Claude Code's own
   * cost-state exceeds the transcript (docs/FORMATS.md).
   */
  classifierRequests: number;
  /** usage.* keys the parser does not know about (possible new billable token class). */
  unknownUsageKeys: Record<string, number>;
}

export interface TranscriptMeta {
  sessionId: string | null;
  cwd: string | null;
  gitBranch: string | null;
  versions: string[];
  entrypoints: string[];
  title: string | null;
  firstTs: string | null;
  lastTs: string | null;
}

export interface ParsedTranscript {
  parserId: string;
  messages: RawMessage[];
  compactions: CompactionEvent[];
  turns: { index: number; ts: string }[];
  meta: TranscriptMeta;
  costState: CostStateSnapshot | null;
  stats: ParseStats;
}

export interface ParseOptions {
  /** File lives under <session>/subagents/. */
  subagent?: boolean;
  /** Agent id derived from the file name (agent-<id>.jsonl), used when entries lack agentId. */
  agentIdFromFile?: string | null;
}

export interface TranscriptParser {
  id: string;
  /** Inclusive range of Claude Code versions this parser was verified against (docs/FORMATS.md). */
  verifiedRange: [string, string];
  handles(version: string): boolean;
  parse(lines: string[], opts?: ParseOptions): ParsedTranscript;
}
