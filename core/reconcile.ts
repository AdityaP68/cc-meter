import type { SessionRow } from './aggregate.js';
import { messageCost, type PriceTable } from './pricing.js';

export interface ReconRow {
  model: string;
  /** `cost` is null for an unpriced model: unpriced is never $0. */
  ccmeter: { input: number; output: number; cacheWrite: number; cacheRead: number; cost: number | null };
  claudeCode: { input: number; output: number; cacheWrite: number; cacheRead: number; cost: number } | null;
  /** ccmeter minus Claude Code (tokens). */
  delta: { input: number; output: number; cacheWrite: number; cacheRead: number } | null;
  tokensMatch: boolean;
  /**
   * What our price table says Claude Code's own token counts cost. cost-state does not split cache writes by TTL,
   * so this is a range: all writes at the 5m rate (low) to all at the 1h rate (high). null if unpriced.
   */
  priceRange: { low: number; high: number } | null;
}

/**
 * Compare a recorded session with Claude Code's own accounting (the `cost-state` transcript entry).
 * Differences are expected when Claude Code made API calls that never became assistant entries
 * (see docs/FORMATS.md, "Known discrepancies").
 */
export function reconcile(s: Pick<SessionRow, 'models' | 'costState'>, table: PriceTable): ReconRow[] {
  const names = new Set<string>(s.models.map((m) => m.model));
  for (const m of Object.keys(s.costState?.modelUsage ?? {})) names.add(m);
  return [...names].sort().map((model) => {
    const ours = s.models.find((m) => m.model === model);
    const cc = s.costState?.modelUsage[model];
    const o = {
      input: ours?.input ?? 0,
      output: ours?.output ?? 0,
      cacheWrite: ours?.cacheWrite ?? 0,
      cacheRead: ours?.cacheRead ?? 0,
      cost: ours?.unpriced ? null : ours?.cost ?? 0,
    };
    if (!cc) return { model, ccmeter: o, claudeCode: null, delta: null, tokensMatch: false, priceRange: null };
    const c = {
      input: cc.inputTokens,
      output: cc.outputTokens,
      cacheWrite: cc.cacheCreationInputTokens,
      cacheRead: cc.cacheReadInputTokens,
      cost: cc.costUSD,
    };
    const delta = {
      input: o.input - c.input,
      output: o.output - c.output,
      cacheWrite: o.cacheWrite - c.cacheWrite,
      cacheRead: o.cacheRead - c.cacheRead,
    };
    const base = { model, input: c.input, output: c.output, cacheWrite: c.cacheWrite, cacheRead: c.cacheRead, webSearch: cc.webSearchRequests, speed: null };
    const low = messageCost(table, { ...base, cacheWrite1h: 0 });
    const high = messageCost(table, { ...base, cacheWrite1h: c.cacheWrite });
    return {
      model,
      ccmeter: o,
      claudeCode: c,
      delta,
      tokensMatch: !delta.input && !delta.output && !delta.cacheWrite && !delta.cacheRead,
      priceRange: low === null || high === null ? null : { low, high },
    };
  });
}

export type TokenClass = 'input' | 'output' | 'cacheWrite' | 'cacheRead';

export interface PartialRecord {
  /** Models in the transcript that Claude Code's cost-state has no entry for. */
  missingModels: string[];
  /** Models for which Claude Code counted fewer tokens than the transcript, with the classes where it did. */
  fewerTokens: { model: string; classes: TokenClass[] }[];
}

/**
 * Whether Claude Code's `cost-state` provably covers only part of the session (docs/FORMATS.md, Known discrepancies
 * 3): a model ccmeter saw is missing from it, or it counted fewer tokens than the transcript in some class for some
 * model. Then its total is not the session's cost and ccmeter's is the complete one. null when there is no
 * cost-state entry or nothing shows it to be partial. Exactly the sessions for which `hiddenCallsEstimate` declines
 * because coverage fails.
 */
export function claudeCodePartial(s: Pick<SessionRow, 'models' | 'costState'>, table: PriceTable): PartialRecord | null {
  if (!s.costState) return null;
  const missingModels: string[] = [];
  const fewerTokens: PartialRecord['fewerTokens'] = [];
  for (const r of reconcile(s, table)) {
    if (!r.delta) {
      missingModels.push(r.model);
      continue;
    }
    const classes = (['input', 'output', 'cacheWrite', 'cacheRead'] as const).filter((k) => r.delta![k] > 0);
    if (classes.length) fewerTokens.push({ model: r.model, classes });
  }
  return missingModels.length || fewerTokens.length ? { missingModels, fewerTokens } : null;
}

export interface HiddenCallsEstimate {
  /** Claude Code's cost minus ccmeter's (USD): calls Claude Code billed but never wrote to the transcript. An estimate. */
  usd: number;
  /** Claude Code's own total for the session (sum of its per-model costUSD). */
  claudeCodeUsd: number;
  /** Output tokens Claude Code counts beyond the transcript, left out because replies were saved mid-stream. */
  outputTokensExcluded: number;
  /** Those output tokens at list price: what the mid-stream replies leave out of ccmeter's cost, by Claude Code's count. */
  outputUsdExcluded: number;
}

/** Below this the difference would print as $0.000; it is not shown. */
const MIN_ESTIMATE_USD = 0.0005;

/**
 * Estimate the cost of API calls Claude Code billed but never wrote to the transcript (docs/FORMATS.md, Known
 * discrepancies 2). Valid only where Claude Code's `cost-state` covers the whole session: every model ccmeter saw is
 * in it, with at least as many tokens in every class. If it counted less anywhere, it covers only part of a session
 * resumed across processes (item 3), ccmeter's total is the complete one, and there is nothing to estimate (null).
 * With replies saved mid-stream (item 1) the output difference is theirs, so it is left out. A model with a
 * difference that ccmeter cannot price gives null: unpriced is never $0.
 */
export function hiddenCallsEstimate(s: Pick<SessionRow, 'models' | 'costState' | 'partialMessages'>, table: PriceTable): HiddenCallsEstimate | null {
  if (!s.costState) return null;
  let usd = 0;
  let claudeCodeUsd = 0;
  let outputTokensExcluded = 0;
  let outputUsdExcluded = 0;
  for (const r of reconcile(s, table)) {
    if (!r.claudeCode || !r.delta) return null;
    const d = r.delta;
    if (d.input > 0 || d.output > 0 || d.cacheWrite > 0 || d.cacheRead > 0) return null;
    claudeCodeUsd += r.claudeCode.cost;
    if (r.tokensMatch) continue;
    if (r.ccmeter.cost === null) return null;
    let gap = r.claudeCode.cost - r.ccmeter.cost;
    const inTranscript = s.models.some((m) => m.model === r.model);
    if (s.partialMessages > 0 && inTranscript && d.output < 0) {
      const out = messageCost(table, { model: r.model, input: 0, output: -d.output, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0, webSearch: 0, speed: null });
      if (out === null) return null;
      gap -= out;
      outputTokensExcluded += -d.output;
      outputUsdExcluded += out;
    }
    usd += gap;
  }
  return usd < MIN_ESTIMATE_USD ? null : { usd, claudeCodeUsd, outputTokensExcluded, outputUsdExcluded };
}

export interface ClaudeCodeFigure {
  model: string;
  /** Sessions that used the model. */
  sessions: number;
  /** Of those, sessions whose cost-state entry carries a cost for the model. */
  withFigure: number;
  /** Sum of Claude Code's own costUSD for the model over those sessions. */
  costUsd: number;
}

/**
 * Claude Code's own recorded cost for each model, a stopgap for models ccmeter cannot price. It is shown next to
 * ccmeter's numbers, labelled as Claude Code's, and never added to ccmeter's totals (unpriced stays NULL, ADR 0005).
 */
export function claudeCodeFigures(rows: Pick<SessionRow, 'models' | 'costState'>[], models: string[]): ClaudeCodeFigure[] {
  return models.map((model) => {
    const f: ClaudeCodeFigure = { model, sessions: 0, withFigure: 0, costUsd: 0 };
    for (const s of rows) {
      if (!s.models.some((m) => m.model === model)) continue;
      f.sessions++;
      const u = s.costState?.modelUsage[model];
      if (u) {
        f.withFigure++;
        f.costUsd += u.costUSD;
      }
    }
    return f;
  });
}

