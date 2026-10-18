export const usd = (n: number): string => (n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`);

export function tok(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function dur(ms: number | null): string {
  if (ms === null) return '-';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h${String(m % 60).padStart(2, '0')}` : `${Math.round(h / 24)}d`;
}

export function pad(s: string, n: number, right = false): string {
  const t = s.length > n ? s.slice(0, n - 1) + '…' : s;
  return right ? t.padStart(n) : t.padEnd(n);
}

/** One line naming models without a price and what to do about it (report header; the dashboard has its own banner). */
export const unpricedNotice = (models: string[]): string =>
  `⚠ No price for ${models.join(', ')}: costs for ${models.length === 1 ? 'it are' : 'them are'} left out (never $0). Add a price to ~/.agent-lens/pricing.json, or run \`agent-lens doctor\` for details and a suggested price.`;

/** A price, or "unpriced" for null: an unpriced model is never shown as free. */
export const usdOrUnpriced = (n: number | null): string => (n === null ? 'unpriced' : usd(n));

/** "$12.30" or "$12.30 + unpriced" — an unpriced model is never shown as free. */
export function costCell(costUsd: number, unpricedTokens: number): string {
  return unpricedTokens > 0 ? `${usd(costUsd)}+unpriced` : usd(costUsd);
}

export function table(rows: string[][], header: string[], rightCols: number[] = []): string {
  const all = [header, ...rows];
  const w = header.map((_, i) => Math.max(...all.map((r) => (r[i] ?? '').length)));
  const line = (r: string[]) => r.map((c, i) => (rightCols.includes(i) ? c.padStart(w[i]!) : c.padEnd(w[i]!))).join('  ');
  return [line(header), w.map((n) => '-'.repeat(n)).join('  '), ...rows.map(line)].join('\n');
}
