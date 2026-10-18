import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSession } from '../core/record.js';
import { loadPricing } from '../core/pricing.js';
import { reconcile } from '../core/reconcile.js';
import { FIXTURES, allFixtures } from './helpers/util.js';
import { oracle, subagentJsonl } from './helpers/oracle.js';

const table = loadPricing({ overridePath: null });
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

describe('golden fixtures (sanitized real transcripts)', () => {
  const fixtures = allFixtures();
  it('has fixtures for several Claude Code versions', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
  });

  for (const rel of fixtures) {
    const file = path.join(FIXTURES, rel);
    describe(rel, () => {
      const s = parseSession(file, table)!;

      it('matches the committed golden summary', () => {
        const expected = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.expected.json'), 'utf8'));
        expect({
          parserStatus: s.parserStatus,
          ccVersions: s.ccVersions,
          turns: s.turns,
          messages: s.messageCount,
          sidechainMessages: s.sidechainMessageCount,
          partialMessages: s.partialMessages,
          tokens: s.tokens,
          sidechainTokens: s.sidechainTokens,
          costUsd: r6(s.costUsd),
          models: s.models.map((m) => ({ model: m.model, messages: m.messages, input: m.input, output: m.output, cacheWrite: m.cacheWrite, cacheRead: m.cacheRead, cost: r6(m.cost) })),
          switches: s.switches.map((x) => ({ from: x.from, to: x.to, turn: x.turn })),
          compactions: s.compactions.map((c) => ({ trigger: c.trigger, preTokens: c.preTokens, postTokens: c.postTokens, turn: c.turn })),
          unpricedModels: s.unpricedModels,
          stats: { duplicatesCollapsed: s.stats.duplicatesCollapsed, syntheticIgnored: s.stats.syntheticIgnored, unparsable: s.stats.unparsable, unknownTypes: s.stats.unknownTypes },
        }).toEqual(expected);
      });

      it('agrees with an independent naive oracle on per-model token totals', () => {
        const o = oracle([file, ...subagentJsonl(file)]);
        expect(s.messageCount).toBe(o.messages);
        expect(s.tokens).toEqual(o.total);
        for (const [model, t] of Object.entries(o.perModel)) {
          const m = s.models.find((x) => x.model === model)!;
          expect({ input: m.input, output: m.output, cacheWrite: m.cacheWrite, cacheRead: m.cacheRead, messages: m.messages }).toEqual(t);
        }
      });

      it('records no unknown entry types or unparsable lines in verified versions', () => {
        expect(s.stats.unparsable).toBe(0);
        expect(s.stats.unknownTypes).toEqual({});
        expect(s.parserStatus).toBe('verified');
      });
    });
  }

  it("matches Claude Code's own cost-state token totals on complete sessions (independent oracle: Claude Code itself)", () => {
    for (const rel of ['cc-2.1.286/sdk-complete.jsonl', 'cc-2.1.287/sdk-complete.jsonl']) {
      const s = parseSession(path.join(FIXTURES, rel), table)!;
      expect(s.costState, rel).not.toBeNull();
      const rows = reconcile({ models: s.models.map((m) => ({ ...m })), costState: s.costState } as any, table);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.tokensMatch, `${rel} ${r.model} delta=${JSON.stringify(r.delta)}`).toBe(true);
        // and our price table lands inside the range implied by Claude Code's own costUSD
        expect(r.claudeCode!.cost).toBeGreaterThanOrEqual(r.priceRange!.low - 0.005);
        expect(r.claudeCode!.cost).toBeLessThanOrEqual(r.priceRange!.high + 0.005);
        expect(r.ours.cost).toBeCloseTo(r.claudeCode!.cost, 5);
      }
    }
  });

  it('keeps subagent output as a lower bound: partial messages are flagged', () => {
    const s = parseSession(path.join(FIXTURES, 'cc-2.1.28x/with-subagents/sess-subagents.jsonl'), table)!;
    expect(s.sidechainMessageCount).toBeGreaterThan(0);
    expect(s.partialMessages).toBeGreaterThan(0);
    expect(s.messages.filter((m) => m.stopReason === null).every((m) => m.sidechain)).toBe(true);
  });

  it('detects the model switch and compactions in the multi-model fixture', () => {
    const s = parseSession(path.join(FIXTURES, 'cc-2.1.28x/multi-model-compaction.jsonl'), table)!;
    expect(s.switches).toHaveLength(1);
    expect(s.compactions.length).toBeGreaterThanOrEqual(3);
  });
});
