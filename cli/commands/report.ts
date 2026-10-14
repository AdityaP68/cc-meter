import { getSession, listSessions, overview, rollup, type SessionSort } from '../../core/aggregate.js';
import { openDb } from '../../core/db.js';
import { loadPricing } from '../../core/pricing.js';
import { reconcile } from '../../core/reconcile.js';
import { flagNum, flagStr, type Parsed } from '../args.js';
import { costCell, dur, pad, table, tok, usd } from '../format.js';

function sinceFlag(args: Parsed): string | undefined {
  const s = flagStr(args, 'since');
  if (!s) return undefined;
  const m = /^(\d+)d$/.exec(s);
  return m ? new Date(Date.now() - Number(m[1]) * 86400000).toISOString() : s;
}

export async function cmdReport(args: Parsed): Promise<number> {
  const db = openDb();
  const tableP = loadPricing();
  const json = !!args.flags.json;
  const f = { since: sinceFlag(args), project: flagStr(args, 'project'), model: flagStr(args, 'model'), source: flagStr(args, 'source') };

  const sid = flagStr(args, 'session');
  if (sid) {
    const full = (db.prepare('SELECT session_id FROM sessions WHERE session_id LIKE ? LIMIT 2').all(`${sid}%`) as { session_id: string }[]);
    if (full.length !== 1) {
      console.error(full.length ? `ambiguous session prefix "${sid}"` : `no recorded session "${sid}" (try \`ccmeter record --all\`)`);
      return 1;
    }
    const d = getSession(db, full[0]!.session_id)!;
    const recon = reconcile(d.session, tableP);
    if (json) {
      console.log(JSON.stringify({ ...d, reconciliation: recon }, null, 2));
      return 0;
    }
    const s = d.session;
    console.log(`Session ${s.sessionId}  [${s.source}]`);
    console.log(`  title    ${s.title ?? '-'}`);
    console.log(`  project  ${s.cwd ?? '-'}`);
    console.log(`  span     ${s.startedAt} -> ${s.endedAt} (${dur(s.durationMs)}), ${s.turns} turns, ${s.messages} API messages (${s.sidechainMessages} from subagents)`);
    console.log(`  Claude Code ${s.ccVersions.join(', ')}  parser ${s.parserStatus}`);
    console.log(`  tokens   in ${s.inputTokens}  out ${s.outputTokens}  cache-write ${s.cacheWriteTokens}  cache-read ${s.cacheReadTokens}  (total ${tok(s.totalTokens)})`);
    console.log(`  cost     ${costCell(s.costUsd, s.unpricedTokens)}${s.unpricedModels.length ? `  unpriced: ${s.unpricedModels.join(', ')}` : ''}`);
    const clf = (JSON.parse(String((db.prepare('SELECT parse_stats p FROM sessions WHERE session_id = ?').get(s.sessionId) as { p: string }).p)).classifierRequests as number) || 0;
    if (clf) console.log(`  note     ${clf} assistant messages carry a server-side classifier request: Claude Code may bill calls that are not transcript messages, so its total can exceed ccmeter's (the reverse happens in sessions spanning several processes)`);
    if (s.partialMessages) console.log(`  note     ${s.partialMessages} messages carry unfinalized usage (stop_reason null); their output tokens are a lower bound`);
    console.log(`  switches ${s.switches}, compactions ${s.compactions}`);
    for (const e of d.events) console.log(`    ${e.ts ?? ''} turn ${e.turn}: ${e.kind === 'model_switch' ? `${e.fromModel} -> ${e.toModel}` : `compaction ${JSON.stringify(e.detail)}`}`);
    console.log("\nPer model, versus Claude Code's own cost-state entry:");
    console.log(
      table(
        recon.flatMap((r) => [
          [r.model, 'ccmeter', String(r.ccmeter.input), String(r.ccmeter.output), String(r.ccmeter.cacheWrite), String(r.ccmeter.cacheRead), usd(r.ccmeter.cost)],
          ...(r.claudeCode
            ? [['', 'claude-code', String(r.claudeCode.input), String(r.claudeCode.output), String(r.claudeCode.cacheWrite), String(r.claudeCode.cacheRead), usd(r.claudeCode.cost)], ['', r.tokensMatch ? 'MATCH' : 'delta', ...(r.delta ? [String(r.delta.input), String(r.delta.output), String(r.delta.cacheWrite), String(r.delta.cacheRead)] : []), '']]
            : [['', 'claude-code', '(no cost-state entry for this model)', '', '', '', '']]),
        ]),
        ['model', 'source', 'input', 'output', 'cache-write', 'cache-read', 'cost'],
        [2, 3, 4, 5, 6],
      ),
    );
    return 0;
  }

  const by = flagStr(args, 'by');
  if (by === 'day' || by === 'project' || by === 'model') {
    const rows = rollup(db, by, f);
    if (json) console.log(JSON.stringify(rows, null, 2));
    else
      console.log(
        table(
          rows.map((r) => [r.key, String(r.sessions), tok(r.totalTokens), costCell(r.costUsd, r.unpricedTokens)]),
          [by, 'sessions', 'tokens', 'cost'],
          [1, 2, 3],
        ),
      );
    return 0;
  }

  const { total, rows } = listSessions(db, { ...f, limit: flagNum(args, 'limit') ?? 20, sort: (flagStr(args, 'sort') as SessionSort | undefined) ?? 'recent' });
  if (json) {
    console.log(JSON.stringify({ total, overview: overview(db, f), sessions: rows }, null, 2));
    return 0;
  }
  const o = overview(db, f);
  console.log(`${o.sessions} sessions, ${tok(o.totalTokens)} tokens, ${costCell(o.costUsd, o.unpricedTokens)}${o.unpricedModels.length ? `  (unpriced: ${o.unpricedModels.join(', ')})` : ''}`);
  console.log(
    table(
      rows.map((s) => [
        s.sessionId.slice(0, 8),
        (s.startedAt ?? '').slice(0, 16).replace('T', ' '),
        pad(s.project ?? '-', 22),
        pad(s.title ?? '', 28),
        String(s.turns),
        dur(s.durationMs),
        tok(s.totalTokens),
        costCell(s.costUsd, s.unpricedTokens),
        String(s.switches),
        s.models.map((m) => m.model.replace(/^claude-/, '')).join(','),
      ]),
      ['id', 'started', 'project', 'title', 'turns', 'dur', 'tokens', 'cost', 'sw', 'models'],
      [4, 5, 6, 7, 8],
    ),
  );
  if (total > rows.length) console.log(`… ${total - rows.length} more (use --limit)`);
  return 0;
}
