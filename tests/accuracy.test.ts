import { describe, expect, it } from 'vitest';
import { accuracyReport } from '../core/accuracy.js';
import { loadPricing, messageCost } from '../core/pricing.js';
import type { SessionRow } from '../core/aggregate.js';
import type { PricingVerifyRow } from '../core/doctor.js';

// The Health page's accuracy report: every number is an aggregate over recorded sessions, and every session lands in
// exactly one class, so the classes always add up to the sessions that have a Claude Code cost entry.
const table = loadPricing({ overridePath: null });
type T = { input: number; output: number; cacheWrite: number; cacheRead: number };
const S = 'claude-sonnet-5-5';
const price = (model: string, t: T) => messageCost(table, { model, ...t, cacheWrite1h: t.cacheWrite, webSearch: 0, speed: null })!;
const ours = (model: string, t: T, unpriced = false) => ({ model, messages: 2, cost: unpriced ? 0 : price(model, t), unpriced, ...t });
const theirs = (model: string, t: T) => ({ inputTokens: t.input, outputTokens: t.output, cacheReadInputTokens: t.cacheRead, cacheCreationInputTokens: t.cacheWrite, thinkingTokens: 0, webSearchRequests: 0, costUSD: price(model, t) });
const cs = (model: string, t: T) => ({ totalCostUSD: price(model, t), modelUsage: { [model]: theirs(model, t) }, hasUnknownModelCost: false });

const seen: T = { input: 200, output: 100, cacheWrite: 2000, cacheRead: 10_000 };
const billed: T = { input: 2224, output: 130, cacheWrite: 2000, cacheRead: 210_000 };
const less: T = { ...seen, cacheRead: seen.cacheRead - 1 };

const sess = (id: string, t: T, costState: unknown, over: Partial<SessionRow> = {}): SessionRow =>
  ({ sessionId: id, models: [ours(S, t)], costState, partialMessages: 0, costUsd: price(S, t), unpricedTokens: 0, unpricedModels: [], parserStatus: 'verified', ...over }) as unknown as SessionRow;

const pricing: PricingVerifyRow[] = [
  { model: S, basis: 'verified', pairs: 4, consistent: 4, maxOutsideUsd: 0, exactTokenPairs: 2, exactMaxAbsErrUsd: 0 },
  { model: 'claude-opus-5', basis: 'list', pairs: 0, consistent: 0, maxOutsideUsd: 0, exactTokenPairs: 0, exactMaxAbsErrUsd: 0 },
];

describe('accuracyReport', () => {
  const sessions = [
    sess('a', seen, cs(S, seen)), // exact
    sess('b', seen, cs(S, billed)), // Claude Code billed more: hidden calls
    sess('c', seen, cs(S, less)), // Claude Code counted less: partial record
    sess('d', seen, null), // no Claude Code cost entry
    sess('e', seen, cs(S, seen), { parserStatus: 'unverified-newer' }),
  ];
  const r = accuracyReport(sessions, pricing);

  it('puts every session with a Claude Code cost entry into exactly one class', () => {
    expect(r.sessions).toBe(5);
    expect(r.withClaudeCodeRecord).toBe(4);
    expect(r.withoutClaudeCodeRecord).toBe(1);
    expect(r.exact).toBe(2);
    expect(r.hiddenCalls.sessions).toBe(1);
    expect(r.partialRecord).toBe(1);
    expect(r.other).toBe(0);
    expect(r.exact + r.hiddenCalls.sessions + r.partialRecord + r.other).toBe(r.withClaudeCodeRecord);
  });

  it('sums the hidden-calls estimate and relates it to the total, never adding it to agent-lens cost', () => {
    expect(r.hiddenCalls.usd).toBeCloseTo(price(S, billed) - price(S, seen), 9);
    expect(r.costUsd).toBeCloseTo(sessions.reduce((n, s) => n + s.costUsd, 0), 9);
  });

  it('counts (session, model) pairs the way doctor does', () => {
    expect(r.pairs).toBe(4);
    expect(r.pairsMatched).toBe(2);
  });

  it('summarises the price table and unverified parser versions', () => {
    expect(r.pricing).toEqual({ models: 2, verified: 1, list: 1, derived: 0, pairs: 4, consistent: 4 });
    expect(r.unverifiedParserSessions).toBe(1);
  });

  it('keeps unpriced out of the dollar totals and reports it', () => {
    const u = accuracyReport([sess('u', seen, null, { unpricedTokens: 500, unpricedModels: ['claude-mystery-9'] })], []);
    expect(u.unpricedTokens).toBe(500);
    expect(u.unpricedModels).toEqual(['claude-mystery-9']);
  });

  it('classifies a difference it cannot explain as other, not exact', () => {
    // Claude Code has a model the transcript lacks and nothing else: partial. An unpriced model with a gap: other.
    const o = accuracyReport([sess('o', seen, cs(S, billed), { models: [ours(S, seen, true)] })], []);
    expect(o.other).toBe(1);
    expect(o.exact).toBe(0);
  });

  it('is empty-safe', () => {
    const e = accuracyReport([], []);
    expect(e.sessions).toBe(0);
    expect(e.hiddenCalls.usd).toBe(0);
  });
});
