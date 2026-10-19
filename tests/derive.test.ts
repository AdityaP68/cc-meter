import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../core/db.js';
import { deriveRates, type RateSample } from '../core/derive.js';
import { runDoctor } from '../core/doctor.js';
import { loadPricing } from '../core/pricing.js';
import { recordTranscript } from '../core/record.js';
import { asst, tmpDir } from './helpers/util.js';

// Rates (USD per million tokens) a hypothetical new model might have; samples are what Claude Code's cost-state records.
const truth = { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 6 };
const sample = (input: number, output: number, cacheRead: number, cacheWrite: number): RateSample => ({
  input, output, cacheRead, cacheWrite, webSearch: 0,
  costUsd: (input * truth.input + output * truth.output + cacheRead * truth.cacheRead + cacheWrite * truth.cacheWrite) / 1e6,
});
const varied = [sample(1000, 200, 50_000, 3000), sample(20_000, 5000, 900_000, 40_000), sample(300, 9000, 10_000, 0), sample(7000, 100, 2_000_000, 120_000), sample(50, 50, 0, 8000)];

describe('deriveRates (least squares over cost-state entries)', () => {
  it('recovers the rates from varied samples, with the fit error and sample count', () => {
    const r = deriveRates(varied, 0.01);
    if (!r.ok) throw new Error(r.reason);
    for (const k of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) expect(r.rates[k]).toBeCloseTo(truth[k], 6);
    expect(r.samples).toBe(5);
    expect(r.maxAbsErrUsd).toBeLessThan(1e-9);
  });

  it('refuses with fewer samples than rates', () => {
    const r = deriveRates(varied.slice(0, 3), 0.01);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('needs at least 4');
  });

  it('refuses when a token type never occurs (that rate cannot be derived)', () => {
    const r = deriveRates(varied.map((s) => sample(s.input, s.output, s.cacheRead, 0)), 0.01);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('cache writes');
  });

  it('refuses when samples are proportional (token mixes do not vary)', () => {
    const r = deriveRates([1, 2, 3, 4, 5].map((k) => sample(1000 * k, 200 * k, 50_000 * k, 3000 * k)), 0.01);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('do not vary enough');
  });
});

describe('derived prices in doctor and the price table', () => {
  it("doctor suggests a pasteable snippet with basis 'derived' and never writes the user's pricing file", () => {
    const home = tmpDir();
    const claude = tmpDir('claude-');
    process.env.CCMETER_HOME = home;
    process.env.CLAUDE_CONFIG_DIR = claude;
    const dir = path.join(claude, 'projects', '-p');
    fs.mkdirSync(dir, { recursive: true });
    const db = openDb(path.join(home, 't.db'));
    const table = loadPricing({ overridePath: null });
    varied.forEach((s, i) => {
      const f = path.join(dir, `m${i}.jsonl`);
      const cs = { type: 'cost-state', totalCostUSD: s.costUsd, modelUsage: { 'claude-mystery-9': { inputTokens: s.input, outputTokens: s.output, cacheReadInputTokens: s.cacheRead, cacheCreationInputTokens: s.cacheWrite, costUSD: s.costUsd, webSearchRequests: 0 } } };
      fs.writeFileSync(f, [asst({ id: `a${i}`, model: 'claude-mystery-9', input: s.input, output: s.output, cr: s.cacheRead, cw: s.cacheWrite }), JSON.stringify(cs)].join('\n'));
      recordTranscript(db, table, f);
    });
    const d = runDoctor(db, table, { skipExternal: true, claudeVersion: '2.1.287', pluginList: 'ccmeter@ccmeter ✔ enabled' }).find((c) => c.id === 'derived-price:claude-mystery-9')!;
    expect(d.title).toContain('claude-mystery-9');
    expect(d.detail).toContain('5 sessions');
    const snippet = JSON.parse(d.detail!.slice(d.detail!.indexOf('{')));
    expect(snippet['claude-mystery-9'].basis).toBe('derived');
    expect(snippet['claude-mystery-9'].output).toBeCloseTo(20, 3);
    expect(fs.existsSync(path.join(home, 'pricing.json'))).toBe(false);
    db.close();
    delete process.env.CCMETER_HOME;
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  it("the price table accepts basis 'derived' and still rejects unknown bases", () => {
    const file = path.join(tmpDir(), 'pricing.json');
    const p = { input: 4, output: 20, cacheRead: 0.4, cacheWrite5m: 6, cacheWrite1h: 6 };
    fs.writeFileSync(file, JSON.stringify({ models: { 'claude-mystery-9': { ...p, basis: 'derived' }, 'claude-other-1': { ...p, basis: 'guess' } } }));
    const t = loadPricing({ overridePath: file });
    expect(t.models['claude-mystery-9']?.basis).toBe('derived');
    expect(t.rejected).toEqual(['claude-other-1']);
  });
});
