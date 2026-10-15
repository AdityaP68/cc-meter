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

