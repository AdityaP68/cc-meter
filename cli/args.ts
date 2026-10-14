export interface Parsed {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/** Minimal flag parser: --flag, --flag value, --flag=value. */
export function parseArgs(argv: string[], booleans: string[] = []): Parsed {
  const out: Parsed = { positionals: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      else {
        const name = a.slice(2);
        const next = argv[i + 1];
        if (booleans.includes(name) || next === undefined || next.startsWith('--')) out.flags[name] = true;
        else {
          out.flags[name] = next;
          i++;
        }
      }
    } else out.positionals.push(a);
  }
  return out;
}

export const flagStr = (p: Parsed, k: string): string | undefined => {
  const v = p.flags[k];
  return typeof v === 'string' ? v : undefined;
};
export const flagNum = (p: Parsed, k: string): number | undefined => {
  const v = flagStr(p, k);
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : undefined;
};
