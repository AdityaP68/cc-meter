import { cc21 } from './cc21.js';
import type { TranscriptParser } from './types.js';

export * from './types.js';
export { isRealPrompt } from './cc21.js';

/** Registered parsers, oldest first. Add a new module here when Claude Code changes the transcript format. */
export const PARSERS: TranscriptParser[] = [cc21];

export type ParserStatus =
  | 'verified' // version inside the parser's verified range
  | 'unverified-newer' // handled by the parser but newer than anything verified
  | 'unverified-older'
  | 'fallback' // no parser claims this version; using the newest parser anyway
  | 'no-version'; // transcript carried no version field

export interface ParserSelection {
  parser: TranscriptParser;
  status: ParserStatus;
  version: string | null;
}

export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Find the Claude Code version from the first entries that carry one (cheap regex, no full parse). */
export function detectVersion(lines: string[]): string | null {
  let seen = 0;
  for (const line of lines) {
    if (!line) continue;
    const m = /"version":"(\d+\.\d+\.\d+[^"]*)"/.exec(line);
    if (m) return m[1] ?? null;
    if (++seen > 400) break;
  }
  return null;
}

export function selectParser(version: string | null): ParserSelection {
  const newest = PARSERS[PARSERS.length - 1]!;
  if (!version) return { parser: newest, status: 'no-version', version };
  const hit = [...PARSERS].reverse().find((p) => p.handles(version));
  if (!hit) return { parser: newest, status: 'fallback', version };
  const [lo, hi] = hit.verifiedRange;
  if (cmpVersion(version, lo) < 0) return { parser: hit, status: 'unverified-older', version };
  if (cmpVersion(version, hi) > 0) return { parser: hit, status: 'unverified-newer', version };
  return { parser: hit, status: 'verified', version };
}
