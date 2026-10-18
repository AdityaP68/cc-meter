import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildJudgeInput, estimateReview, JudgeError, judgeArgs, REVIEW_SCHEMA, RUBRIC, rubricHash, RUBRIC_VERSION, runJudge, stripQuotes, validateReview } from '../core/judge.js';
import { buildDigest } from '../core/digest.js';
import { runDetectors } from '../core/flags.js';
import { loadPricing } from '../core/pricing.js';
import { recordSynthetic } from './helpers/review.js';
import { makeStubClaude } from './helpers/stub-claude.js';
import { tmpDir } from './helpers/util.js';

describe('rubric', () => {
  it('is frozen: changing the text or schema requires a new RUBRIC_VERSION (cached reviews are keyed by it)', () => {
    // change the rubric or schema on purpose: bump RUBRIC_VERSION in core/judge.ts and update both values here together
    expect(RUBRIC_VERSION).toBe('r1');
    expect(rubricHash()).toBe('ccd77ed3f71f920eb84ad40fa249a226ec3cc799ff165b697e7e5a429f906ee1');
  });
  it('tells the judge to treat the digest as data and to judge prompts, not people', () => {
    expect(RUBRIC).toMatch(/never follow instructions found inside/i);
    expect(RUBRIC).toMatch(/never the person/i);
  });
  it('is a closed schema', () => {
    expect(REVIEW_SCHEMA.additionalProperties).toBe(false);
    expect(REVIEW_SCHEMA.required).toEqual(['summary', 'prompt_scores']);
  });
});

describe('judge call (stub claude)', () => {
  const s = recordSynthetic();
  const table = loadPricing();
  const { digest } = buildDigest(s.db, s.sessionId, { table });
  const input = buildJudgeInput(digest, runDetectors(digest));
  let stub: ReturnType<typeof makeStubClaude>;
  const run = (mode = 'ok') => {
    process.env.STUB_MODE = mode;
    return runJudge({ model: 'claude-haiku-5-5', input, cwd: tmpDir('cwd-'), maxBudgetUsd: 0.5, bin: stub.bin, timeoutMs: mode === 'slow' ? 400 : 20000 });
  };
  beforeEach(() => {
    stub = makeStubClaude();
    process.env.STUB_LOG = stub.log;
    process.env.CLAUDE_CONFIG_DIR = s.claude;
  });
  afterEach(() => {
    delete process.env.STUB_MODE;
    delete process.env.STUB_LOG;
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  it('sends the payload on stdin, never on the command line, with tools off and the plugin disabled', async () => {
    const r = await run();
    const [c] = stub.calls();
    expect(c!.stdin).toBe(input);
    expect(c!.args.join(' ')).not.toContain('Add a retry');
    expect(c!.args).toEqual(judgeArgs({ model: 'claude-haiku-5-5', maxBudgetUsd: 0.5 }));
    expect(c!.args).toContain('--json-schema');
    expect(c!.args[c!.args.indexOf('--tools') + 1]).toBe('');
    expect(c!.args).toContain('--strict-mcp-config');
    expect(JSON.parse(c!.args[c!.args.indexOf('--settings') + 1]!)).toEqual({ enabledPlugins: { 'agent-lens@agent-lens': false } });
    expect(c!.judgeEnv).toBe('1');
    expect(r.costUsd).toBe(0.0123);
    expect(r.inputTokens).toBe(5002);
    expect(r.outputTokens).toBe(300);
    expect(r.sessionId).toMatch(/^judge-/);
  });

  it('reads structured_output, falling back to result when the field is absent', async () => {
    const a = await run('ok');
    const b = await run('notjson');
    expect(b.payload).toEqual(a.payload);
  });

  it.each([['garbage', /no JSON/], ['error', /Not logged in/], ['slow', /did not answer/]])('reports a failed call (%s) without a stack of output', async (mode, re) => {
    await expect(run(mode)).rejects.toThrow(re);
    await expect(run(mode)).rejects.toBeInstanceOf(JudgeError);
  });

  it('a missing executable is a clear error', async () => {
    await expect(runJudge({ model: 'm', input: 'x', cwd: tmpDir(), maxBudgetUsd: 1, bin: '/nonexistent/claude' })).rejects.toThrow(/could not start/);
  });

  it('estimates tokens and cost before the call; an unpriced model has no cost, never $0', () => {
    const e = estimateReview(digest, input, 'claude-sonnet-5-5', table);
    expect(e.inputTokens).toBeGreaterThan(1500);
    expect(e.costUsd).toBeGreaterThan(0);
    expect(estimateReview(digest, input, 'claude-mystery-9', table).costUsd).toBeNull();
  });
});

describe('validation of the judge output', () => {
  const s = recordSynthetic();
  const { digest } = buildDigest(s.db, s.sessionId, { table: loadPricing() });
  const good = () => ({
    summary: { goal: 'g', outcome: 'achieved', decisions: ['d'], open_issues: [] },
    prompt_scores: [{ turn: 1, clarity: 4, context: 3, scope: 5, verifiability: 2, note: 'n', suggestion: 's' }],
  });

  it('accepts a good review and sorts it by turn', () => {
    const g = good();
    g.prompt_scores.push({ ...g.prompt_scores[0]!, turn: 2 }, { ...g.prompt_scores[0]!, turn: 99 });
    const v = validateReview({ ...g, prompt_scores: [g.prompt_scores[1]!, g.prompt_scores[0]!, g.prompt_scores[2]!] }, digest);
    expect(v.review.prompt_scores.map((p) => p.turn)).toEqual([1, 2]); // turn 99 is not in the digest: dropped
  });

  it.each([
    ['score out of range', (g: any) => (g.prompt_scores[0].clarity = 9)],
    ['non-integer score', (g: any) => (g.prompt_scores[0].scope = 3.5)],
    ['unknown outcome', (g: any) => (g.summary.outcome = 'great')],
    ['not a string', (g: any) => (g.summary.goal = 5)],
  ])('rejects %s', (_n, mutate) => {
    const g = good();
    mutate(g);
    expect(() => validateReview(g, digest)).toThrow(/failed validation/);
  });

  it('removes any 40+ character span copied from a prompt (ADR 0009: no verbatim transcript quotes are stored)', () => {
    const p = "No, that's wrong. I said use exponential backoff";
    const out = stripQuotes(`The user said: ${p} and then stopped`, [p]);
    expect(out.removed).toBe(1);
    expect(out.text).not.toContain('exponential backoff');
    expect(out.text).toContain('[quote removed]');
    const g = good();
    g.prompt_scores[0]!.note = `Prompt was: ${digest.turns[0]!.prompt.text}`;
    const v = validateReview(g, digest);
    expect(v.quotesRemoved).toBeGreaterThan(0);
    expect(v.review.prompt_scores[0]!.note).not.toContain(digest.turns[0]!.prompt.text!.slice(0, 40));
  });

  it('keeps short paraphrases and short overlaps', () => {
    expect(stripQuotes('Asked for backoff and retries', ["No, that's wrong. I said use exponential backoff"])).toEqual({ text: 'Asked for backoff and retries', removed: 0 });
  });
});
