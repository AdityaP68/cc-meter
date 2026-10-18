/**
 * Derive per-token rates for a model agent-lens has no price for, from Claude Code's own cost-state entries.
 * Each entry gives token totals and Claude Code's costUSD, so cost = Σ tokens × rate is a linear system; with
 * enough entries whose token mixes differ, least squares recovers the rates. The result is a suggestion with
 * basis "derived" (ADR 0008): agent-lens prints it and never writes it into a pricing file.
 */

export interface RateSample {
  input: number;
  output: number;
  cacheRead: number;
  /** cost-state does not split cache writes by TTL, so one blended write rate is derived. */
  cacheWrite: number;
  webSearch: number;
  costUsd: number;
}

export interface DerivedRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type DeriveResult =
  | { ok: true; rates: DerivedRates; samples: number; maxAbsErrUsd: number; maxRelErr: number }
  | { ok: false; reason: string; samples: number };

const COLS = [
  ['input', 'input tokens'],
  ['output', 'output tokens'],
  ['cacheRead', 'cache reads'],
  ['cacheWrite', 'cache writes'],
] as const;

/** Rates in USD per million tokens. Refuses rather than guessing when the data cannot determine every rate. */
export function deriveRates(samples: RateSample[], webSearchPerRequest: number): DeriveResult {
  const n = samples.length;
  if (n < COLS.length) return { ok: false, reason: `needs at least ${COLS.length} sessions with a Claude Code cost for the model; found ${n}`, samples: n };
  const X = samples.map((s) => COLS.map(([k]) => s[k] / 1e6));
  const y = samples.map((s) => s.costUsd - s.webSearch * webSearchPerRequest);
  const norms = COLS.map((_, j) => Math.sqrt(X.reduce((a, row) => a + row[j]! ** 2, 0)));
  const absent = COLS.filter((_, j) => norms[j] === 0).map(([, label]) => label);
  if (absent.length) return { ok: false, reason: `no session has ${absent.join(' or ')}, so ${absent.length === 1 ? 'that rate' : 'those rates'} cannot be derived`, samples: n };

  // Normal equations on unit-norm columns (well scaled), solved by Gaussian elimination with partial pivoting.
  const m = COLS.length;
  const A = Array.from({ length: m }, (_, i) => [
    ...Array.from({ length: m }, (_, j) => X.reduce((a, row) => a + (row[i]! / norms[i]!) * (row[j]! / norms[j]!), 0)),
    X.reduce((a, row, r) => a + (row[i]! / norms[i]!) * y[r]!, 0),
  ]);
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[p]![c]!)) p = r;
    if (Math.abs(A[p]![c]!) < 1e-9) return { ok: false, reason: 'the sessions\' token mixes do not vary enough to separate the rates', samples: n };
    [A[c], A[p]] = [A[p]!, A[c]!];
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let k = c; k <= m; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  const beta = COLS.map((_, j) => A[j]![m]! / A[j]![j]! / norms[j]!);
  if (beta.some((b) => !Number.isFinite(b) || b < -1e-9)) return { ok: false, reason: 'the fit gives a negative or non-finite rate, so Claude Code\'s figures are not consistent with one price', samples: n };
  const rates = Object.fromEntries(COLS.map(([k], j) => [k, Math.max(0, beta[j]!)])) as unknown as DerivedRates;
  let maxAbsErrUsd = 0;
  let maxRelErr = 0;
  X.forEach((row, r) => {
    const err = Math.abs(row.reduce((a, v, j) => a + v * beta[j]!, 0) - y[r]!);
    maxAbsErrUsd = Math.max(maxAbsErrUsd, err);
    if (y[r]! > 0) maxRelErr = Math.max(maxRelErr, err / y[r]!);
  });
  return { ok: true, rates, samples: n, maxAbsErrUsd, maxRelErr };
}
