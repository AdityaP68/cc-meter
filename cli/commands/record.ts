import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../core/db.js';
import { claudeHome, ensureHome, agentLensHome } from '../../core/paths.js';
import { loadPricing } from '../../core/pricing.js';
import { listTranscripts, recordAll, recordTranscript } from '../../core/record.js';
import { flagStr, type Parsed } from '../args.js';
import { usd } from '../format.js';
import { readStdinText } from '../stdin.js';

function logLine(msg: string): void {
  try {
    ensureHome();
    const file = path.join(agentLensHome(), 'record.log');
    // keep the log small: truncate when it passes 256 KB
    try {
      if (fs.statSync(file).size > 256 * 1024) fs.writeFileSync(file, '');
    } catch {
      /* new file */
    }
    fs.appendFileSync(file, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* logging must never fail the hook */
  }
}

function readStdinJson(): Record<string, unknown> | null {
  try {
    const text = readStdinText();
    return text.trim() ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function findBySessionId(id: string): string | null {
  return listTranscripts().find((f) => path.basename(f, '.jsonl') === id) ?? null;
}

/**
 * `agent-lens record`
 *   (no args, stdin JSON)  hook mode: reads a Claude Code hook payload, records that session, prints NOTHING, exits 0.
 *   --transcript <file>    record one transcript
 *   --session <id>         record one session found under ~/.claude/projects
 *   --all                  backfill every transcript (prints a summary)
 */
export async function cmdRecord(args: Parsed): Promise<number> {
  const explicit = args.flags.all || args.flags.transcript || args.flags.session;
  const force = !!args.flags.force;
  const t0 = Date.now();

  if (!explicit) {
    // Hook mode. Never print, never fail the session.
    try {
      const payload = readStdinJson();
      const tp = typeof payload?.transcript_path === 'string' ? payload.transcript_path : null;
      if (!tp) {
        logLine(`hook ${String(payload?.hook_event_name ?? '?')} without transcript_path; ignored`);
        return 0;
      }
      const db = openDb();
      const res = recordTranscript(db, loadPricing(), tp, { force });
      db.close();
      logLine(`hook ${String(payload?.hook_event_name ?? '?')} ${res.sessionId} ${res.status} ${Date.now() - t0}ms`);
    } catch (e) {
      logLine(`hook error: ${e instanceof Error ? e.message : String(e)}`);
    }
    return 0;
  }

  const json = !!args.flags.json;
  const db = openDb();
  const table = loadPricing();
  if (args.flags.all) {
    const r = recordAll(db, table, { force });
    db.close();
    if (json) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(`Scanned ${r.total} transcripts under ${path.join(claudeHome(), 'projects')} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      console.log(`  recorded ${r.recorded}, unchanged ${r.unchanged}, skipped (no assistant messages) ${r.empty}, errors ${r.errors.length}`);
      for (const e of r.errors.slice(0, 5)) console.log(`  error: ${e.file}: ${e.error}`);
    }
    return r.errors.length ? 1 : 0;
  }

  const file = flagStr(args, 'transcript') ?? findBySessionId(flagStr(args, 'session') ?? '');
  if (!file) {
    console.error('transcript not found');
    return 1;
  }
  const res = recordTranscript(db, table, file, { force });
  db.close();
  if (json) console.log(JSON.stringify({ status: res.status, sessionId: res.sessionId }));
  else
    console.log(
      res.summary
        ? `${res.status}: ${res.sessionId}  ${res.summary.messageCount} messages, ${usd(res.summary.costUsd)}`
        : `${res.status}: ${res.sessionId}`,
    );
  return res.status === 'missing' ? 1 : 0;
}
