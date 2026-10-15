import { openDb } from '../../core/db.js';
import { runDoctor, verifyPricing } from '../../core/doctor.js';
import { loadPricing } from '../../core/pricing.js';
import type { Parsed } from '../args.js';
import { table } from '../format.js';

const ICON = { ok: '✔', info: 'ℹ', warn: '⚠', error: '✘' } as const;

export async function cmdDoctor(args: Parsed): Promise<number> {
  const db = openDb();
  const t = loadPricing();
  const checks = runDoctor(db, t);
  if (args.flags.json) {
    console.log(JSON.stringify(checks, null, 2));
  } else {
    for (const c of checks) {
      console.log(`${ICON[c.level]} ${c.title}`);
      if (c.detail && c.level !== 'ok') console.log(`    ${c.detail}`);
    }
    if (args.flags['verify-pricing']) {
      const rows = verifyPricing(db, t);
      console.log("\nPrice table versus Claude Code's own costUSD (cost-state entries in your transcripts):");
      console.log(
        rows.length
          ? table(
              rows.map((r) => (r.pairs ? [r.model, r.basis, `${r.consistent}/${r.pairs}`, `$${r.maxOutsideUsd.toFixed(4)}`, String(r.exactTokenPairs), r.exactTokenPairs ? `$${r.exactMaxAbsErrUsd.toFixed(5)}` : '-'] : [r.model, r.basis, 'no Claude Code cost recorded', '', '', ''])),
              ['model', 'basis', 'in-range', 'max outside', 'exact-token pairs', 'max abs err (exact)'],
              [2, 3, 4, 5],
            )
          : '(no priced model recorded yet)',
      );
    }
    const n = (l: string) => checks.filter((c) => c.level === l).length;
    console.log(`\n${n('ok')} ok, ${n('info')} info, ${n('warn')} warnings, ${n('error')} errors`);
  }
  db.close();
  return checks.some((c) => c.level === 'error') ? 2 : 0;
}
