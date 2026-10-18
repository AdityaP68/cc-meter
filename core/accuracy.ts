import type { SessionRow } from './aggregate.js';
import type { PricingVerifyRow } from './doctor.js';
import { hiddenCallsEstimate, reconcile, claudeCodePartial } from './reconcile.js';
import { loadPricing, type PriceTable } from './pricing.js';

/**
 * Aggregate accuracy of what ccmeter shows, for the Health page. Only counts and dollar sums: no titles, paths or text.
 * ccmeter compares two sources it has locally: the transcript (priced by pricing.json) and Claude Code's own
 * `cost-state` entry. No third, independent source is used here (OTel or a gateway export would be one).
 */
export interface AccuracyReport {
  sessions: number;
  withClaudeCodeRecord: number;
  withoutClaudeCodeRecord: number;
  /** Sessions with a cost entry, by what the comparison showed. The four classes add up to `withClaudeCodeRecord`. */
  exact: number;
  hiddenCalls: { sessions: number; usd: number };
  partialRecord: number;
  other: number;
  /** (session, model) pairs where Claude Code wrote a cost entry, and those whose four token counts equal ccmeter's. */
  pairs: number;
  pairsMatched: number;
  /** ccmeter's total for all recorded sessions (priced models only); the hidden-calls estimate is not part of it. */
  costUsd: number;
  unpricedTokens: number;
  unpricedModels: string[];
  pricing: { models: number; verified: number; list: number; derived: number; pairs: number; consistent: number };
  unverifiedParserSessions: number;
}

export function accuracyReport(sessions: SessionRow[], pricing: PricingVerifyRow[], table: PriceTable = loadPricing()): AccuracyReport {
  const r: AccuracyReport = {
    sessions: sessions.length, withClaudeCodeRecord: 0, withoutClaudeCodeRecord: 0,
    exact: 0, hiddenCalls: { sessions: 0, usd: 0 }, partialRecord: 0, other: 0,
    pairs: 0, pairsMatched: 0, costUsd: 0, unpricedTokens: 0, unpricedModels: [],
    pricing: { models: pricing.length, verified: 0, list: 0, derived: 0, pairs: 0, consistent: 0 },
    unverifiedParserSessions: 0,
  };
  const unpriced = new Set<string>();
  for (const s of sessions) {
    r.costUsd += s.costUsd;
    r.unpricedTokens += s.unpricedTokens;
    for (const m of s.unpricedModels) unpriced.add(m);
    if (s.parserStatus !== null && s.parserStatus !== 'verified') r.unverifiedParserSessions++;
    if (!s.costState) {
      r.withoutClaudeCodeRecord++;
      continue;
    }
    r.withClaudeCodeRecord++;
    const rows = reconcile(s, table);
    for (const row of rows) {
      if (!row.claudeCode) continue;
      r.pairs++;
      if (row.tokensMatch) r.pairsMatched++;
    }
    const hidden = hiddenCallsEstimate(s, table);
    if (rows.every((x) => x.tokensMatch)) r.exact++;
    else if (hidden) {
      r.hiddenCalls.sessions++;
      r.hiddenCalls.usd += hidden.usd;
    } else if (claudeCodePartial(s, table)) r.partialRecord++;
    else r.other++;
  }
  r.unpricedModels = [...unpriced].sort();
  for (const p of pricing) {
    if (p.basis === 'verified') r.pricing.verified++;
    else if (p.basis === 'derived') r.pricing.derived++;
    else r.pricing.list++;
    r.pricing.pairs += p.pairs;
    r.pricing.consistent += p.consistent;
  }
  return r;
}
