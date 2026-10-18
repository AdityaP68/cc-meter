import { describe, expect, it } from 'vitest';
import { exportRows } from '../cli/commands/export.js';
import { usdOrUnpriced } from '../cli/format.js';
import { loadPricing } from '../core/pricing.js';
import { reconcile } from '../core/reconcile.js';

// ADR 0005: an unpriced model is never shown or exported as $0. These cover the places that used to print "$0".
const table = loadPricing({ overridePath: null });
const model = (m: string, cost: number, unpriced: boolean) => ({ model: m, messages: 1, cost, unpriced, input: 100, output: 50, cacheWrite: 0, cacheRead: 0 });

describe('unpriced is never $0', () => {
  it('reconcile reports a null agent-lens cost for an unpriced model and a number for a priced one', () => {
    const rows = reconcile({ models: [model('claude-mystery-9', 0, true), model('claude-sonnet-5-5', 1.5, false)], costState: null }, table);
    expect(rows.find((r) => r.model === 'claude-mystery-9')!.ours.cost).toBeNull();
    expect(rows.find((r) => r.model === 'claude-sonnet-5-5')!.ours.cost).toBe(1.5);
  });

  it('the terminal cell says "unpriced" instead of $0', () => {
    expect(usdOrUnpriced(null)).toBe('unpriced');
    expect(usdOrUnpriced(0)).toBe('$0.000');
    expect(usdOrUnpriced(2)).toBe('$2.00');
  });

  it('the MixBar tooltip says unpriced instead of $0', async () => {
    const { mixTitle } = await import('../dashboard/src/format.ts');
    expect(mixTitle([{ model: 'claude-mystery-9', cost: 0, unpriced: true }, { model: 'claude-sonnet-5-5', cost: 1.5, unpriced: false }])).toBe('mystery-9 unpriced · sonnet-5-5 $1.50');
  });

  it('export leaves costUsd empty when nothing in the session was priced, and flags incomplete totals', () => {
    const base = { sessionId: 's', models: [], costState: null, ccVersions: [], unpricedModels: ['claude-mystery-9'] };
    const [none, some, full] = exportRows([
      { ...base, costUsd: 0, unpricedTokens: 150 },
      { ...base, costUsd: 3, unpricedTokens: 150 },
      { ...base, costUsd: 0, unpricedTokens: 0, unpricedModels: [] },
    ] as never);
    expect(none!.costUsd).toBeNull();
    expect(none!.costComplete).toBe(false);
    expect(some!.costUsd).toBe(3);
    expect(some!.costComplete).toBe(false);
    expect(full!.costUsd).toBe(0);
    expect(full!.costComplete).toBe(true);
  });
});
