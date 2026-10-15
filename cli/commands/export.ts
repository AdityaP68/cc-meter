import fs from 'node:fs';
import { listSessions, type SessionRow } from '../../core/aggregate.js';
import { openDb } from '../../core/db.js';
import { flagStr, type Parsed } from '../args.js';

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Exports counts, costs and ids only. Prompt/response text is never in the database, so it cannot be exported. */
export async function cmdExport(args: Parsed): Promise<number> {
  const db = openDb();
  const fmt = flagStr(args, 'format') ?? 'json';
  const out = flagStr(args, 'out');
  let text: string;
  if (args.flags.messages) {
    const rows = db.prepare('SELECT * FROM messages ORDER BY session_id, seq').all();
    text = fmt === 'csv' ? toCsv(rows as Record<string, unknown>[]) : JSON.stringify(rows, null, 2);
  } else {
    const { rows } = listSessions(db, { limit: 1_000_000 });
    const flat = exportRows(rows);
    text = fmt === 'csv' ? toCsv(flat) : JSON.stringify(rows.map((r, i) => ({ ...r, costUsd: flat[i]!.costUsd, costComplete: flat[i]!.costComplete })), null, 2);
  }
  db.close();
  if (out) fs.writeFileSync(out, text + '\n');
  else console.log(text);
  return 0;
}

/**
 * Session rows for export. An unpriced model is never $0 (ADR 0005): `costUsd` is null when nothing in the session
 * was priced, and `costComplete` is false whenever some tokens were left out of `costUsd`.
 */
export function exportRows(rows: SessionRow[]) {
  return rows.map(({ models, costState, ccVersions, unpricedModels, ...r }) => ({
    ...r,
    costUsd: r.unpricedTokens > 0 && r.costUsd === 0 ? null : r.costUsd,
    costComplete: r.unpricedTokens === 0,
    models: models.map((m) => m.model).join(' '),
    unpricedModels: unpricedModels.join(' '),
    ccVersions: ccVersions.join(' '),
    claudeCodeCostUsd: costState?.totalCostUSD ?? null,
  }));
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]!);
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
}
