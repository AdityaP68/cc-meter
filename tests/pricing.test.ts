import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPricing, lookupPrice, messageCost } from '../core/pricing.js';
import { tmpDir } from './helpers/util.js';

const table = loadPricing({ overridePath: null });
const base = { input: 0, output: 0, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0, webSearch: 0, speed: null };

describe('cost math', () => {
  it('reproduces a real Claude Code costUSD for Haiku 4.5 (1h cache writes)', () => {
    // From a real cost-state entry: 10 in, 38 out, 21000 cache read, 9336 cache write (all 1h) => $0.020972
    const c = messageCost(table, { ...base, model: 'claude-haiku-4-5-20251001', input: 10, output: 38, cacheRead: 21000, cacheWrite: 9336, cacheWrite1h: 9336 });
    expect(c).toBeCloseTo(0.020972, 9);
  });

  it('reproduces a real Claude Code costUSD for Opus 5.5', () => {
    // Real cost-state: 10844 in, 37162 out, 11766865 read, 208461 write (1h) => $4.807677
    const c = messageCost(table, { ...base, model: 'claude-opus-5-5', input: 10844, output: 37162, cacheRead: 11766865, cacheWrite: 208461, cacheWrite1h: 208461 });
    expect(c).toBeCloseTo(4.807677, 6);
  });

  it('bills 5m and 1h cache writes at different rates', () => {
    const all5m = messageCost(table, { ...base, model: 'claude-sonnet-5-5', cacheWrite: 1_000_000 })!;
    const all1h = messageCost(table, { ...base, model: 'claude-sonnet-5-5', cacheWrite: 1_000_000, cacheWrite1h: 1_000_000 })!;
    expect(all5m).toBeCloseTo(2.5, 9);
    expect(all1h).toBeCloseTo(4, 9);
  });

  it('returns null (unpriced), never 0, for a model not in the table', () => {
    expect(messageCost(table, { ...base, model: 'claude-mystery-9', input: 1_000_000 })).toBeNull();
  });

  it('resolves dated ids and rejects near-misses', () => {
    expect(lookupPrice(table, 'claude-haiku-4-5-20251001')?.id).toBe('claude-haiku-4-5');
    expect(lookupPrice(table, 'claude-haiku-4-5-latest')).toBeNull();
  });

  it('applies the fast-mode multiplier only to models that define one', () => {
    const slow = messageCost(table, { ...base, model: 'claude-opus-5-5', output: 1_000_000 })!;
    const fast = messageCost(table, { ...base, model: 'claude-opus-5-5', output: 1_000_000, speed: 'fast' })!;
    expect(fast).toBeCloseTo(slow * 2, 9);
    const sonnet = messageCost(table, { ...base, model: 'claude-sonnet-5-5', output: 1_000_000, speed: 'fast' })!;
    expect(sonnet).toBeCloseTo(10, 9);
  });

  it('applies long-context rates above the threshold', () => {
    const below = messageCost(table, { ...base, model: 'claude-haiku-5-5', input: 50_000 })!; // 50k * $0.10/M
    const above = messageCost(table, { ...base, model: 'claude-haiku-5-5', input: 200_000 })!; // 200k * $0.50/M
    expect(below).toBeCloseTo(0.005, 9);
    expect(above).toBeCloseTo(0.1, 9);
  });

  it('adds a per-request web search charge', () => {
    expect(messageCost(table, { ...base, model: 'claude-sonnet-5-5', webSearch: 3 })).toBeCloseTo(3 * table.webSearchPerRequest, 9);
  });
});

describe('price table overrides', () => {
  it('merges ~/.ccmeter/pricing.json over the shipped table and changes the hash', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'pricing.json');
    fs.writeFileSync(file, JSON.stringify({ models: { 'claude-mystery-9': { input: 1, output: 2, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 } } }));
    const t = loadPricing({ overridePath: file });
    expect(messageCost(t, { ...base, model: 'claude-mystery-9', output: 1_000_000 })).toBeCloseTo(2, 9);
    expect(t.hash).not.toBe(table.hash);
    expect(t.sources).toHaveLength(2);
  });

  const overrideTable = (o: unknown) => {
    const file = path.join(tmpDir(), 'pricing.json');
    fs.writeFileSync(file, typeof o === 'string' ? o : JSON.stringify(o));
    return loadPricing({ overridePath: file });
  };
  const good = { input: 1, output: 2, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 };

  it('rejects malformed override entries instead of pricing with NaN, and reports them', () => {
    const t = overrideTable({
      models: {
        'claude-ok-1': good,
        'claude-missing-field': { input: 1, output: 2 },
        'claude-string-rate': { ...good, output: '2' },
        'claude-negative': { ...good, input: -1 },
        'claude-null': null,
        'claude-bad-long': { ...good, longContext: { aboveTokens: 'x', input: 1, output: 2 } },
      },
    });
    expect(messageCost(t, { ...base, model: 'claude-ok-1', output: 1_000_000 })).toBeCloseTo(2, 9);
    for (const m of ['claude-missing-field', 'claude-string-rate', 'claude-negative', 'claude-null', 'claude-bad-long']) {
      expect(messageCost(t, { ...base, model: m, input: 10, output: 10 })).toBeNull();
    }
    expect(t.rejected.sort()).toEqual(['claude-bad-long', 'claude-missing-field', 'claude-negative', 'claude-null', 'claude-string-rate']);
  });

  it('a bad override entry does not shadow a shipped price', () => {
    const t = overrideTable({ models: { 'claude-sonnet-5-5': { ...good, input: 'free' } } });
    expect(messageCost(t, { ...base, model: 'claude-sonnet-5-5', input: 1_000_000 })).toBeCloseTo(messageCost(table, { ...base, model: 'claude-sonnet-5-5', input: 1_000_000 })!, 9);
    expect(t.rejected).toEqual(['claude-sonnet-5-5']);
  });

  it('ignores a non-numeric webSearchPerRequest and unparsable files (reported, not thrown)', () => {
    expect(overrideTable({ webSearchPerRequest: 'cheap' }).webSearchPerRequest).toBe(table.webSearchPerRequest);
    const broken = overrideTable('{ not json');
    expect(broken.hash).toBe(table.hash);
    expect(broken.rejected).toEqual(['pricing.json is not valid JSON']);
  });

  it('inherited object keys are not models', () => {
    for (const m of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(lookupPrice(table, m)).toBeNull();
      expect(messageCost(table, { ...base, model: m, input: 5 })).toBeNull();
    }
    const t = overrideTable('{"models":{"__proto__":{"input":1,"output":2,"cacheRead":0.1,"cacheWrite5m":1,"cacheWrite1h":2}}}');
    expect(Object.getPrototypeOf(t.models)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).input).toBeUndefined();
  });

  it('a non-finite result is unpriced, never NaN', () => {
    expect(messageCost(table, { ...base, model: 'claude-sonnet-5-5', input: NaN })).toBeNull();
  });
});
