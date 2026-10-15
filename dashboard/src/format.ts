export const usd = (n: number): string =>
  n >= 1000 ? `$${Math.round(n).toLocaleString()}` : n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : n === 0 ? '$0' : `$${n.toFixed(3)}`;

/** An estimate, so no more precision than cents: "≈ $0.11", "< $0.01". */
export const approxUsd = (n: number): string => (n < 0.01 ? '< $0.01' : n >= 100 ? `≈ ${usd(n)}` : `≈ $${n.toFixed(2)}`);

export function tok(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString();
}

export function dur(ms: number | null): string {
  if (ms === null) return '–';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${Math.round(h / 24)}d`;
}

export const when = (iso: string | null): string => {
  if (!iso) return '–';
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
};

/** claude-sonnet-5-5 -> sonnet-5-5 */
export const shortModel = (m: string): string => m.replace(/^claude-/, '').replace(/-\d{8}$/, '');

/** Tooltip for a model-mix bar. An unpriced model is labelled, never shown as $0. */
export const mixTitle = (models: { model: string; cost: number; unpriced: boolean }[]): string =>
  models.map((x) => `${shortModel(x.model)} ${x.unpriced ? 'unpriced' : usd(x.cost)}`).join(' · ');

/** Axis maximum whose quarters are round numbers (1, 2, 4, 8 x 10^k). */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 8 ? 8 : 10) * p;
}

/** Compact, consistent axis labels: whole dollars from $10 up, cents below. */
export const usdAxis = (n: number): string => (n === 0 ? '$0' : n >= 10 ? `$${Math.round(n).toLocaleString()}` : n >= 1 ? `$${n.toFixed(1).replace(/\.0$/, '')}` : `$${n.toFixed(2)}`);
