// Types mirror core/aggregate.ts (kept separate so the SPA has no dependency on Node-only modules).
export interface ModelTotals { model: string; messages: number; input: number; output: number; cacheWrite: number; cacheRead: number; cost: number; unpriced: boolean }
export interface CostState { totalCostUSD: number; modelUsage: Record<string, { costUSD: number }> }
/** Estimated cost of calls Claude Code billed but never wrote to the transcript; null where no estimate is valid. */
export interface HiddenCalls { usd: number; claudeCodeUsd: number; outputTokensExcluded: number; outputUsdExcluded: number }
/** Claude Code's cost-state covers only part of the session: models it lacks, and models where it counted fewer tokens. */
export interface PartialRecord { missingModels: string[]; fewerTokens: { model: string; classes: ('input' | 'output' | 'cacheWrite' | 'cacheRead')[] }[] }
export interface Session {
  sessionId: string; source: string; project: string | null; cwd: string | null; title: string | null; label: string; entrypoint: string | null;
  startedAt: string | null; endedAt: string | null; durationMs: number | null; turns: number; messages: number;
  sidechainMessages: number; partialMessages: number; inputTokens: number; outputTokens: number; cacheWriteTokens: number;
  cacheReadTokens: number; totalTokens: number; costUsd: number; unpricedTokens: number; unpricedModels: string[];
  models: ModelTotals[]; switches: number; compactions: number; parserStatus: string | null; ccVersions: string[]; costState: CostState | null;
  hiddenCalls: HiddenCalls | null;
  claudeCodePartial: PartialRecord | null;
}
export interface Turn { turn: number; ts: string | null; costUsd: number; sidechainCostUsd: number; unpricedTokens: number; tokens: number; messages: number; models: string[]; mainModel: string | null }
export interface EventRow { kind: 'model_switch' | 'compaction'; ts: string | null; turn: number | null; fromModel: string | null; toModel: string | null; detail: Record<string, number | string | null> | null }
export interface Recon {
  model: string;
  ours: { input: number; output: number; cacheWrite: number; cacheRead: number; cost: number };
  claudeCode: { input: number; output: number; cacheWrite: number; cacheRead: number; cost: number } | null;
  delta: { input: number; output: number; cacheWrite: number; cacheRead: number } | null;
  tokensMatch: boolean;
}
export interface SessionDetail { session: Session; turns: Turn[]; events: EventRow[]; reconciliation: Recon[] }
export interface Overview {
  sessions: number; costUsd: number; totalTokens: number; unpricedTokens: number; unpricedModels: string[]; switches: number; compactions: number;
  bySource: { source: string; sessions: number; costUsd: number; totalTokens: number }[]; firstStartedAt: string | null; lastStartedAt: string | null;
}
export interface Rollup { key: string; sessions: number; messages: number; totalTokens: number; costUsd: number; unpricedTokens: number }
export interface DayModel { day: string; model: string; costUsd: number; totalTokens: number; unpricedTokens: number }
export interface Facets { projects: string[]; models: string[]; sources: string[]; unpriced: string[] }
export interface Check { id: string; level: 'ok' | 'info' | 'warn' | 'error'; title: string; detail?: string }
export interface PricingRow { model: string; basis: string; pairs: number; consistent: number; maxOutsideUsd: number; exactTokenPairs: number; exactMaxAbsErrUsd: number }

export interface Accuracy {
  sessions: number; withClaudeCodeRecord: number; withoutClaudeCodeRecord: number; exact: number; hiddenCalls: { sessions: number; usd: number };
  partialRecord: number; other: number; pairs: number; pairsMatched: number; costUsd: number; unpricedTokens: number; unpricedModels: string[];
  pricing: { models: number; verified: number; list: number; derived: number; pairs: number; consistent: number }; unverifiedParserSessions: number;
}

export interface Filters { range: string; project: string; model: string; source: string }

export const qs = (input: object): string => {
  const f = input as Record<string, string | number | undefined>;
  const p = new URLSearchParams();
  if (f.range && f.range !== 'all') p.set('since', String(f.range));
  for (const k of ['project', 'model', 'source']) if (f[k]) p.set(k, String(f[k]));
  for (const [k, v] of Object.entries(f)) if (!['range', 'project', 'model', 'source'].includes(k) && v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export async function post(path: string): Promise<unknown> {
  const r = await fetch(path, { method: 'POST', headers: { 'x-agent-lens': '1' } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}
