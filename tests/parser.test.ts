import { describe, expect, it } from 'vitest';
import { splitLines } from '../core/jsonl.js';
import { cc21, isRealPrompt } from '../core/parser/cc21.js';
import { cmpVersion, detectVersion, selectParser } from '../core/parser/index.js';
import { asst, user } from './helpers/util.js';

describe('cc-2.1 parser', () => {
  it('collapses streaming duplicates by message id and keeps the LAST entry', () => {
    const r = cc21.parse([
      asst({ id: 'm1', input: 2, output: 16, cw: 100, stop: null }),
      asst({ id: 'm1', input: 2, output: 272, cw: 100, stop: 'tool_use' }),
      asst({ id: 'm2', input: 1, output: 5 }),
    ]);
    expect(r.messages).toHaveLength(2);
    expect(r.messages.find((m) => m.id === 'm1')).toMatchObject({ output: 272, stopReason: 'tool_use' });
    expect(r.stats.duplicatesCollapsed).toBe(1);
  });

  it('ignores <synthetic> and API-error assistant messages but counts them', () => {
    const r = cc21.parse([
      asst({ id: 'm1', output: 10 }),
      asst({ id: 'e1', model: '<synthetic>', output: 0 }),
      asst({ id: 'e2', output: 0, extra: { isApiErrorMessage: true } }),
    ]);
    expect(r.messages.map((m) => m.id)).toEqual(['m1']);
    expect(r.stats.syntheticIgnored).toBe(2);
  });

  it('never throws on unknown entry types, bad JSON, blank lines; counts them instead', () => {
    const r = cc21.parse([
      '',
      'not json at all',
      '[1,2,3]',
      JSON.stringify({ type: 'brand-new-entry', foo: 1 }),
      JSON.stringify({ type: 'brand-new-entry' }),
      JSON.stringify({ nothing: 'typed' }),
      asst({ id: 'm1', output: 1 }),
    ]);
    expect(r.messages).toHaveLength(1);
    expect(r.stats.unparsable).toBe(2);
    expect(r.stats.blank).toBe(1);
    expect(r.stats.unknownTypes).toEqual({ 'brand-new-entry': 2, '(none)': 1 });
  });

  it('counts unknown usage keys (a possible new billable token class)', () => {
    const r = cc21.parse([asst({ id: 'm1', usageExtra: { audio_tokens: 5, speed: 'standard' } })]);
    expect(r.stats.unknownUsageKeys).toEqual({ audio_tokens: 1 });
  });

  it('does not treat U+2028 inside a JSON string as a line break (readline would)', () => {
    const tricky = asst({ id: 'm1', output: 3, extra: { note: 'a b c' } });
    expect(tricky).toContain(' ');
    const lines = splitLines(tricky + '\n' + asst({ id: 'm2', output: 4 }));
    expect(lines).toHaveLength(2);
    const r = cc21.parse(lines);
    expect(r.messages).toHaveLength(2);
    expect(r.stats.unparsable).toBe(0);
  });

  it('splits cache writes into 5m and 1h tiers and clamps the 1h share', () => {
    const r = cc21.parse([asst({ id: 'm1', cw: 1000, cw1h: 400 }), asst({ id: 'm2', cw: 10, cw1h: 0 })]);
    expect(r.messages[0]).toMatchObject({ cacheWrite: 1000, cacheWrite1h: 400 });
    expect(r.messages[1]).toMatchObject({ cacheWrite: 10, cacheWrite1h: 0 });
  });

  it('tags sidechain messages (subagent file or isSidechain flag) and carries the agent id', () => {
    const viaFlag = cc21.parse([asst({ id: 'm1', sidechain: true, agentId: 'a1' })]);
    expect(viaFlag.messages[0]).toMatchObject({ sidechain: true, agentId: 'a1' });
    const viaFile = cc21.parse([asst({ id: 'm2' })], { subagent: true, agentIdFromFile: 'abc' });
    expect(viaFile.messages[0]).toMatchObject({ sidechain: true, agentId: 'abc' });
    const main = cc21.parse([asst({ id: 'm3' })]);
    expect(main.messages[0]).toMatchObject({ sidechain: false, agentId: null });
  });

  it('counts only real user prompts as turns and assigns messages to them', () => {
    const toolResult = [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }];
    const r = cc21.parse([
      asst({ id: 'pre', output: 1 }),
      user('first real prompt'),
      asst({ id: 'a1', output: 1 }),
      user(toolResult),
      asst({ id: 'a2', output: 1 }),
      user('<command-name>/login</command-name>'),
      user('<local-command-caveat>x</local-command-caveat>', undefined, { isMeta: true }),
      user('This session is being continued from a previous conversation', undefined, { isCompactSummary: true }),
      user('<task-notification>done</task-notification>', undefined, { promptSource: 'system' }),
      user([{ type: 'text', text: 'second prompt as a text block' }]),
      asst({ id: 'a3', output: 1 }),
    ]);
    expect(r.turns).toHaveLength(2);
    const turnOf = Object.fromEntries(r.messages.map((m) => [m.id, m.turn]));
    expect(turnOf).toEqual({ pre: 0, a1: 1, a2: 1, a3: 2 });
  });

  it('does not count sidechain user entries as turns', () => {
    expect(isRealPrompt({ type: 'user', isSidechain: true, message: { content: 'subagent task' } })).toBe(false);
    expect(isRealPrompt({ type: 'user', message: { content: [{ type: 'tool_result' }] } })).toBe(false);
    expect(isRealPrompt({ type: 'user', message: { content: 'hello' } })).toBe(true);
  });

  it('records compaction boundaries with their metadata and turn', () => {
    const r = cc21.parse([
      user('go'),
      JSON.stringify({ type: 'system', subtype: 'compact_boundary', timestamp: '2026-01-01T01:00:00.000Z', compactMetadata: { trigger: 'auto', preTokens: 900000, postTokens: 17000 } }),
    ]);
    expect(r.compactions).toEqual([{ ts: '2026-01-01T01:00:00.000Z', trigger: 'auto', preTokens: 900000, postTokens: 17000, turn: 1 }]);
  });

  it('reads the cost-state snapshot (last one wins) and titles', () => {
    const cs = (n: number) => JSON.stringify({ type: 'cost-state', totalCostUSD: n, modelUsage: { 'claude-sonnet-5-5': { inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 3, cacheCreationInputTokens: 4, costUSD: n, webSearchRequests: 0 } } });
    const r = cc21.parse([cs(1), JSON.stringify({ type: 'ai-title', aiTitle: 'AI' }), JSON.stringify({ type: 'custom-title', customTitle: 'Mine' }), cs(2)]);
    expect(r.costState?.totalCostUSD).toBe(2);
    expect(r.meta.title).toBe('Mine');
  });

  it('survives a message with no id (falls back to requestId/uuid) and one with no usage', () => {
    const noId = JSON.parse(asst({ id: 'x', output: 7 }));
    delete noId.message.id;
    noId.requestId = 'req_1';
    const noUsage = JSON.parse(asst({ id: 'y' }));
    delete noUsage.message.usage;
    const r = cc21.parse([JSON.stringify(noId), JSON.stringify(noUsage)]);
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0]!.id).toBe('req_1');
    expect(r.stats).toMatchObject({ assistantWithoutId: 1, assistantWithoutUsage: 1 });
  });
});

describe('parser selection by Claude Code version', () => {
  it('detects the version from the first entries', () => {
    expect(detectVersion([asst({ id: 'a' })])).toBe('2.1.287');
    expect(detectVersion(['{}', ''])).toBeNull();
  });
  it('classifies versions relative to the verified range', () => {
    expect(selectParser('2.1.287').status).toBe('verified');
    expect(selectParser('2.1.236').status).toBe('verified');
    expect(selectParser('2.1.999').status).toBe('unverified-newer');
    expect(selectParser('2.1.100').status).toBe('unverified-older');
    expect(selectParser('3.0.0').status).toBe('fallback');
    expect(selectParser(null).status).toBe('no-version');
  });
  it('compares versions numerically, not lexically', () => {
    expect(cmpVersion('2.1.9', '2.1.10')).toBe(-1);
    expect(cmpVersion('2.1.295', '2.1.295')).toBe(0);
  });
});
