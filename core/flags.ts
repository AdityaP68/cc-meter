import fs from 'node:fs';
import path from 'node:path';
import type { Digest } from './digest.js';
import { ccmeterHome } from './paths.js';

/**
 * Heuristic flags computed from the digest alone (zero tokens; docs/ARCHITECTURE.md, Milestone 3 §2). A flag is a hint about
 * a session's workflow, shown next to it; it is not a score and carries no person. `detail` is a fixed template filled with
 * counts and tool names, never user text.
 */
export interface Flag {
  detector: string;
  severity: 'info' | 'notice';
  turns: number[];
  count: number;
  detail: string;
}

export type DetectorParams = Record<string, unknown>;

/** One detector = one module with its own id and parameters (`detectors.<id>` in ~/.ccmeter/config.json). */
export interface Detector {
  id: string;
  defaults?: DetectorParams;
  detect(digest: Digest, params: DetectorParams): Flag[];
}

/**
 * Ids reserved for detectors whose definition the owner has not given. "complaint" was requested by name; its meaning is not
 * in the repository (docs/ASSUMPTIONS.md), so nothing is built under it. A future module registers it with `registerDetector`.
 */
export const RESERVED_DETECTOR_IDS = ['complaint'] as const;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

const toolErrors: Detector = {
  id: 'tool_errors',
  defaults: { noticeRate: 0.25, noticeMinErrors: 3 },
  detect(d, p) {
    const errs = d.turns.filter((t) => sum(t.tool_errors) > 0);
    const n = errs.reduce((a, t) => a + sum(t.tool_errors), 0);
    if (n === 0) return [];
    const calls = d.turns.reduce((a, t) => a + sum(t.tools), 0);
    const rate = calls ? n / calls : 0;
    return [
      {
        detector: 'tool_errors',
        severity: rate >= Number(p.noticeRate) && n >= Number(p.noticeMinErrors) ? 'notice' : 'info',
        turns: errs.map((t) => t.turn),
        count: n,
        detail: `${n} of ${plural(calls, 'tool call')} returned an error (${Math.round(rate * 100)}%)`,
      },
    ];
  },
};

const retryLoops: Detector = {
  id: 'retry_loops',
  defaults: { minRepeats: 3 },
  detect(d, p) {
    const out: Flag[] = [];
    for (const t of d.turns)
      for (const [tool, n] of Object.entries(t.repeats))
        if (n >= Number(p.minRepeats)) out.push({ detector: 'retry_loops', severity: 'notice', turns: [t.turn], count: n, detail: `${tool} was called with an identical input ${n} times in turn ${t.turn}` });
    return out;
  },
};

/** From the design table: a prompt that starts with "no," or contains one of these phrases. */
const CORRECTIONS = [/^\s*no\s*[,.!]/i, /\bthat(?:'|’)?s wrong\b/i, /\bthat is wrong\b/i, /\bi said\b/i, /\bundo\b/i, /\brevert\b/i];

const userCorrections: Detector = {
  id: 'user_corrections',
  defaults: { extraPhrases: [] as string[] },
  detect(d, p) {
    const extra = (Array.isArray(p.extraPhrases) ? p.extraPhrases : []).filter((x): x is string => typeof x === 'string' && x.length > 0).map((x) => x.toLowerCase());
    const hit = d.turns.filter((t) => {
      if (t.turn < 2 || t.prompt.text === null) return false; // a correction needs an assistant turn before it
      const text = t.prompt.text;
      return CORRECTIONS.some((re) => re.test(text)) || extra.some((x) => text.toLowerCase().includes(x));
    });
    return hit.length ? [{ detector: 'user_corrections', severity: 'info', turns: hit.map((t) => t.turn), count: hit.length, detail: `${plural(hit.length, 'prompt')} began with or contained a correction phrase` }] : [];
  },
};

const compactions: Detector = {
  id: 'compactions',
  defaults: { window: 2 },
  detect(d, p) {
    const comp = d.events.filter((e) => e.kind === 'compaction');
    if (!comp.length) return [];
    const after = new Set<number>();
    for (const c of comp) for (let k = 1; k <= Number(p.window); k++) if (d.turns.some((t) => t.turn === c.turn + k)) after.add(c.turn + k);
    return [
      {
        detector: 'compactions',
        severity: 'info',
        turns: [...after].sort((a, b) => a - b),
        count: comp.length,
        detail: `${plural(comp.length, 'compaction')}; ${plural(after.size, 'prompt')} followed within ${Number(p.window)} turns`,
      },
    ];
  },
};

export const BUILTIN_DETECTORS: readonly Detector[] = [toolErrors, retryLoops, userCorrections, compactions];
const registered: Detector[] = [];

/** Add a detector module (for example the future "complaint" one). A later registration with the same id replaces it. */
export function registerDetector(d: Detector): void {
  const i = registered.findIndex((x) => x.id === d.id);
  if (i >= 0) registered.splice(i, 1);
  registered.push(d);
}

/** `detectors.<id>` objects from ~/.ccmeter/config.json; missing or unreadable config means defaults. */
export function loadDetectorParams(home = ccmeterHome()): Record<string, DetectorParams> {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8')) as { detectors?: unknown };
    return c.detectors && typeof c.detectors === 'object' && !Array.isArray(c.detectors) ? (c.detectors as Record<string, DetectorParams>) : {};
  } catch {
    return {};
  }
}

export function runDetectors(d: Digest, o: { params?: Record<string, DetectorParams> } = {}): Flag[] {
  const params = o.params ?? {};
  const all = [...BUILTIN_DETECTORS.filter((b) => !registered.some((r) => r.id === b.id)), ...registered];
  return all.flatMap((det) => det.detect(d, { ...det.defaults, ...(params[det.id] ?? {}) }));
}
