import { describe, expect, it } from 'vitest';
import { buildDigest, type Digest } from '../core/digest.js';
import { BUILTIN_DETECTORS, RESERVED_DETECTOR_IDS, registerDetector, runDetectors, type Detector } from '../core/flags.js';
import { loadPricing } from '../core/pricing.js';
import { recordSynthetic } from './helpers/review.js';

describe('heuristic flags', () => {
  const s = recordSynthetic();
  const digest = buildDigest(s.db, s.sessionId, { table: loadPricing() }).digest;
  const flags = runDetectors(digest);
  const by = (id: string) => flags.filter((f) => f.detector === id);

  it('flags tool errors with the turns they happened in', () => {
    const f = by('tool_errors')[0]!;
    expect(f.turns).toEqual([2, 3]);
    expect(f.count).toBe(4);
    expect(f.detail).toBe('4 of 8 tool calls returned an error (50%)');
  });

  it('flags the retry loop: the same tool and input at least 3 times in a turn', () => {
    const f = by('retry_loops')[0]!;
    expect(f.turns).toEqual([2]);
    expect(f.detail).toBe('Bash was called with an identical input 4 times in turn 2');
    expect(runDetectors(digest, { params: { retry_loops: { minRepeats: 5 } } }).filter((x) => x.detector === 'retry_loops')).toEqual([]);
  });

  it('flags a prompt that starts with a correction phrase, never the first prompt', () => {
    const f = by('user_corrections')[0]!;
    expect(f.turns).toEqual([2]);
    const first = JSON.parse(JSON.stringify(digest)) as Digest;
    first.turns[0]!.prompt.text = "No, that's wrong";
    expect(runDetectors(first).filter((x) => x.detector === 'user_corrections')[0]!.turns).toEqual([2]);
  });

  it('flags compactions and the prompts right after them', () => {
    const f = by('compactions')[0]!;
    expect(f.count).toBe(1);
    expect(f.turns).toEqual([3]);
    expect(f.detail).toBe('1 compaction; 1 prompt followed within 2 turns');
  });

  it('flags are hints about the work: no score, no person field', () => {
    for (const f of flags) expect(Object.keys(f).sort()).toEqual(['count', 'detail', 'detector', 'severity', 'turns']);
  });

  it('reserves a slot for "complaint" without defining it', () => {
    expect(RESERVED_DETECTOR_IDS).toContain('complaint');
    expect(BUILTIN_DETECTORS.map((d) => d.id)).not.toContain('complaint');
    expect(flags.some((f) => f.detector === 'complaint')).toBe(false);
  });

  it('runs a registered detector with its own parameters', () => {
    const d: Detector = { id: 'long_turns', defaults: { minMessages: 2 }, detect: (dg, p) => (dg.turns.some((t) => t.messages >= (p.minMessages as number)) ? [{ detector: 'long_turns', severity: 'info', turns: [1], count: 1, detail: 'x' }] : []) };
    registerDetector(d);
    expect(runDetectors(digest).some((f) => f.detector === 'long_turns')).toBe(true);
    expect(runDetectors(digest, { params: { long_turns: { minMessages: 99 } } }).some((f) => f.detector === 'long_turns')).toBe(false);
  });
});
