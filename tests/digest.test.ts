import { describe, expect, it } from 'vitest';
import { buildDigest, digestHash } from '../core/digest.js';
import { loadPricing } from '../core/pricing.js';
import { recordSynthetic, SENTINEL_INPUT, SENTINEL_OUTPUT, SENTINEL_SECRET, syntheticLines } from './helpers/review.js';

describe('digest', () => {
  const s = recordSynthetic();
  const { digest, hash } = buildDigest(s.db, s.sessionId, { table: loadPricing() });

  it('has one row per turn with prompt, tools, errors, cost, tokens and model', () => {
    expect(digest.turns.map((t) => t.turn)).toEqual([1, 2, 3]);
    const [t1, t2, t3] = digest.turns as [typeof digest.turns[0], typeof digest.turns[0], typeof digest.turns[0]];
    expect(t1.prompt.text).toContain('Add a retry to the fetch client');
    expect(t1.tools).toEqual({ Edit: 1, Read: 1 });
    expect(t1.tool_errors).toEqual({});
    expect(t1.messages).toBe(2);
    // sonnet-5-5: $2/M in, $10/M out: (2000*2 + 300*10)/1e6
    expect(t1.cost_usd).toBeCloseTo(0.007, 9);
    expect(t1.tokens).toEqual({ input: 2000, output: 300, cache_write: 0, cache_read: 0 });
    expect(t1.models).toEqual(['claude-sonnet-5-5']);
    expect(t1.outcome.ended).toBe('end_turn');

    expect(t2.tools).toEqual({ Agent: 1, Bash: 4 });
    expect(t2.tool_errors).toEqual({ Bash: 3 });
    expect(t2.subagent_calls).toBe(1);
    expect(t2.subagent_messages).toBe(1);
    expect(t2.repeats).toEqual({ Bash: 4 });
    expect(t2.messages).toBe(3);

    expect(t3.models).toEqual(['claude-haiku-4-5']);
    expect(t3.denials).toEqual({ 'permission-rule': 1 });
    expect(t3.tool_errors).toEqual({ Bash: 1 });
  });

  it('lists events: model switch and compaction with pre/post tokens', () => {
    expect(digest.events).toEqual([
      { kind: 'compaction', turn: 2, trigger: 'auto', pre_tokens: 150000, post_tokens: 9000 },
      { kind: 'model_switch', turn: 3, from: 'claude-sonnet-5-5', to: 'claude-haiku-4-5' },
    ]);
  });

  it('contains no tool output and no tool input, and redacts secrets in prompts', () => {
    const json = JSON.stringify(digest);
    expect(json).not.toContain(SENTINEL_OUTPUT);
    expect(json).not.toContain(SENTINEL_INPUT);
    expect(json).not.toContain(SENTINEL_SECRET);
    expect(json).toContain('[redacted:key]');
    expect(json).not.toContain(s.transcript);
    expect(json).not.toMatch(/"(cwd|project|title|session_id)"/);
  });

  it('caps prompt length and omits prompts of the middle turns of a very long session', () => {
    const capped = buildDigest(s.db, s.sessionId, { table: loadPricing(), promptCap: 10 });
    const p = capped.digest.turns[0]!.prompt;
    expect(p.text!.length).toBeLessThanOrEqual(10);
    expect(p.truncated).toBe(true);
    expect(p.chars).toBeGreaterThan(10);
    const few = buildDigest(s.db, s.sessionId, { table: loadPricing(), maxPromptTurns: 2, headTurns: 1 });
    expect(few.digest.turns.map((t) => t.prompt.text === null)).toEqual([false, true, false]);
    expect(few.digest.omitted_prompt_turns).toBe(1);
  });

  it('has a stable hash: same input, same hash; a changed prompt or tool error changes it; price changes do not', () => {
    expect(buildDigest(s.db, s.sessionId, { table: loadPricing() }).hash).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const priced = loadPricing();
    const other = JSON.parse(JSON.stringify(priced));
    other.models['claude-sonnet-5-5'].input = 99;
    expect(buildDigest(s.db, s.sessionId, { table: other }).hash).toBe(hash);
    const changed = syntheticLines().map((l) => l.replace('Add a retry', 'Add a timeout'));
    const s2 = recordSynthetic(changed, 'synthetic-0002');
    expect(buildDigest(s2.db, s2.sessionId, { table: loadPricing() }).hash).not.toBe(hash);
    expect(digestHash(digest)).toBe(hash);
  });

  it('never reports an unpriced turn as $0', () => {
    const s3 = recordSynthetic(syntheticLines().map((l) => l.replaceAll('claude-haiku-4-5', 'claude-mystery-9')), 'synthetic-0003');
    const d = buildDigest(s3.db, s3.sessionId, { table: loadPricing() }).digest;
    expect(d.turns[2]!.cost_usd).toBeNull();
    expect(d.turns[2]!.unpriced_messages).toBe(2);
  });

  it('rejects an unknown session', () => {
    expect(() => buildDigest(s.db, 'nope', { table: loadPricing() })).toThrow(/no recorded session/);
  });
});
