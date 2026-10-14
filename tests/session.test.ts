import { describe, expect, it } from 'vitest';
import { cc21 } from '../core/parser/cc21.js';
import { loadPricing } from '../core/pricing.js';
import { buildSession } from '../core/session.js';
import { asst, user } from './helpers/util.js';

const table = loadPricing({ overridePath: null });
const build = (main: string[], subs: string[][] = []) =>
  buildSession(cc21.parse(main), subs.map((s, i) => cc21.parse(s, { subagent: true, agentIdFromFile: `ag${i}` })), {
    table,
    source: 'claude-code',
    transcriptPath: '/x/s1.jsonl',
    sessionId: 's1',
    parserStatus: 'verified',
  });
const T = (n: number) => `2026-01-01T00:00:${String(n).padStart(2, '0')}.000Z`;

describe('model switch detection', () => {
  it('emits one event per change of model between consecutive main-chain messages, with timestamps', () => {
    const s = build([
      user('go', T(0)),
      asst({ id: 'a', model: 'claude-sonnet-5-5', ts: T(1) }),
      asst({ id: 'b', model: 'claude-sonnet-5-5', ts: T(2) }),
      asst({ id: 'c', model: 'claude-opus-5-5', ts: T(3) }),
      asst({ id: 'd', model: 'claude-opus-5-5', ts: T(4) }),
      asst({ id: 'e', model: 'claude-sonnet-5-5', ts: T(5) }),
    ]);
    expect(s.switches.map((x) => [x.from, x.to, x.ts])).toEqual([
      ['claude-sonnet-5-5', 'claude-opus-5-5', T(3)],
      ['claude-opus-5-5', 'claude-sonnet-5-5', T(5)],
    ]);
    expect(s.switches[0]!.turn).toBe(1);
  });

  it('does not report a subagent on another model as a user-visible switch', () => {
    const s = build(
      [user('go', T(0)), asst({ id: 'a', ts: T(1) }), asst({ id: 'b', ts: T(3) })],
      [[asst({ id: 'sub1', model: 'claude-opus-5-5', ts: T(2), sidechain: true })]],
    );
    expect(s.switches).toHaveLength(0);
    expect(s.models.map((m) => m.model).sort()).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5']);
    expect(s.sidechainMessageCount).toBe(1);
  });

  it('ignores synthetic messages when diffing models', () => {
    const s = build([asst({ id: 'a', ts: T(1) }), asst({ id: 'e', model: '<synthetic>', ts: T(2) }), asst({ id: 'b', ts: T(3) })]);
    expect(s.switches).toHaveLength(0);
  });
});

describe('session totals', () => {
  it('sums deduplicated usage, bills each message id once even if it appears in two files', () => {
    const dup = asst({ id: 'shared', input: 5, output: 7, ts: T(2), sidechain: true });
    const s = build(
      [asst({ id: 'm1', input: 100, output: 200, cw: 1000, cr: 5000, ts: T(1) }), asst({ id: 'm1', input: 100, output: 200, cw: 1000, cr: 5000, ts: T(1) })],
      [[dup], [dup]],
    );
    expect(s.tokens).toEqual({ input: 105, output: 207, cacheWrite: 1000, cacheRead: 5000 });
    expect(s.messageCount).toBe(2);
    expect(s.sidechainTokens.input).toBe(5);
  });

  it('keeps unpriced models out of the dollar total and flags them (never $0)', () => {
    const s = build([asst({ id: 'a', model: 'claude-sonnet-5-5', input: 1_000_000, ts: T(1) }), asst({ id: 'b', model: 'claude-mystery-9', input: 123, output: 77, ts: T(2) })]);
    expect(s.costUsd).toBeCloseTo(2, 9);
    expect(s.unpricedModels).toEqual(['claude-mystery-9']);
    expect(s.unpricedTokens).toBe(200);
    expect(s.messages.find((m) => m.id === 'b')!.cost).toBeNull();
    expect(s.models.find((m) => m.model === 'claude-mystery-9')!.unpriced).toBe(true);
  });

  it('maps subagent messages onto the turn they ran in, by timestamp', () => {
    const s = build(
      [user('one', T(0)), asst({ id: 'a', ts: T(1) }), user('two', T(10)), asst({ id: 'b', ts: T(11) })],
      [[asst({ id: 's1', ts: T(12), sidechain: true })]],
    );
    expect(s.messages.find((m) => m.id === 's1')!.turn).toBe(2);
  });

  it('counts messages whose final entry has stop_reason null as partial', () => {
    const s = build([asst({ id: 'a', stop: null }), asst({ id: 'b' })]);
    expect(s.partialMessages).toBe(1);
  });
});
