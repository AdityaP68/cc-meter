import fs from 'node:fs';
import path from 'node:path';
import { tx, type Db } from './db.js';
import { claudeHome } from './paths.js';
import { detectVersion, selectParser } from './parser/index.js';
import type { ParsedTranscript } from './parser/types.js';
import { readLines } from './jsonl.js';
import type { PriceTable } from './pricing.js';
import { buildSession, totalTokens, type SessionSummary } from './session.js';

/** Bump when parsing/costing logic changes so existing rows are recomputed. */
export const RECORDER_VERSION = 3;

export const SOURCE_CLAUDE_CODE = 'claude-code';
export const SOURCE_JUDGE = 'agent-lens-judge';
/** Tag of the same thing before the rename; rows and environments that still carry it count as judge runs. */
const LEGACY_SOURCE_JUDGES = ['sessionscope-judge', 'ccmeter-judge'];

export type RecordStatus = 'recorded' | 'unchanged' | 'empty' | 'missing';

export interface RecordResult {
  status: RecordStatus;
  sessionId: string;
  summary?: SessionSummary;
}

export interface RecordOptions {
  /** Recompute even if the transcript is unchanged. */
  force?: boolean;
  /** Override the source tag (otherwise: agent-lens-judge when AGENT_LENS_JUDGE_RUNNING is set, else claude-code). */
  source?: string;
}

interface SubFile {
  file: string;
  agentId: string;
}

/** Subagent transcripts live at <projectDir>/<sessionId>/subagents/agent-<id>.jsonl. */
export function subagentFiles(transcriptPath: string): SubFile[] {
  const dir = path.join(path.dirname(transcriptPath), path.basename(transcriptPath, '.jsonl'), 'subagents');
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.jsonl'))
    .sort()
    .map((n) => ({ file: path.join(dir, n), agentId: n.replace(/^agent-/, '').replace(/\.jsonl$/, '') }));
}

/** Cheap change detector: size+mtime of the main file and every subagent file. */
export function transcriptSignature(transcriptPath: string): string | null {
  try {
    const st = fs.statSync(transcriptPath);
    const parts = [`${st.size}:${Math.floor(st.mtimeMs)}`];
    for (const s of subagentFiles(transcriptPath)) {
      const t = fs.statSync(s.file);
      parts.push(`${t.size}:${Math.floor(t.mtimeMs)}`);
    }
    return parts.join('|');
  } catch {
    return null;
  }
}

export function parseSession(transcriptPath: string, table: PriceTable, opts: { source?: string } = {}): SessionSummary | null {
  const lines = readLines(transcriptPath);
  const sel = selectParser(detectVersion(lines));
  const main: ParsedTranscript = sel.parser.parse(lines);
  const subs = subagentFiles(transcriptPath).map((s) => {
    try {
      return sel.parser.parse(readLines(s.file), { subagent: true, agentIdFromFile: s.agentId });
    } catch {
      return null; // an unreadable subagent file must not lose the whole session
    }
  });
  const sessionId = path.basename(transcriptPath, '.jsonl');
  return buildSession(main, subs.filter((s): s is ParsedTranscript => s !== null), {
    table,
    source: opts.source ?? SOURCE_CLAUDE_CODE,
    transcriptPath,
    sessionId,
    parserStatus: sel.status,
  });
}

export function resolveSource(existing: string | undefined, explicit?: string): string {
  if (explicit) return explicit;
  // Sticky: once a session is known to be a judge run it stays one, even if a later hook lacks the env var.
  if (process.env.AGENT_LENS_JUDGE_RUNNING || process.env.SESSIONSCOPE_JUDGE_RUNNING || process.env.CCMETER_JUDGE_RUNNING || existing === SOURCE_JUDGE || (existing !== undefined && LEGACY_SOURCE_JUDGES.includes(existing))) return SOURCE_JUDGE;
  return existing ?? SOURCE_CLAUDE_CODE;
}

export function recordTranscript(db: Db, table: PriceTable, transcriptPath: string, opts: RecordOptions = {}): RecordResult {
  const sessionId = path.basename(transcriptPath, '.jsonl');
  const sig = transcriptSignature(transcriptPath);
  if (sig === null) return { status: 'missing', sessionId };

  const existing = db
    .prepare('SELECT transcript_sig, pricing_hash, recorder_version, source FROM sessions WHERE session_id = ?')
    .get(sessionId) as
    | { transcript_sig: string; pricing_hash: string; recorder_version: number; source: string }
    | undefined;
  if (
    existing &&
    !opts.force &&
    existing.transcript_sig === sig &&
    existing.pricing_hash === table.hash &&
    existing.recorder_version === RECORDER_VERSION
  )
    return { status: 'unchanged', sessionId };

  const source = resolveSource(existing?.source, opts.source);
  const summary = parseSession(transcriptPath, table, { source });
  if (!summary || summary.messageCount === 0) return { status: 'empty', sessionId };

  writeSession(db, summary, { sig, pricingHash: table.hash });
  return { status: 'recorded', sessionId, summary };
}

export function writeSession(db: Db, s: SessionSummary, meta: { sig: string; pricingHash: string }): void {
  const now = new Date().toISOString();
  tx(db, () => {
    const prior = db.prepare('SELECT first_recorded_at FROM sessions WHERE session_id = ?').get(s.sessionId) as
      | { first_recorded_at: string }
      | undefined;
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(s.sessionId);
    db.prepare('DELETE FROM events WHERE session_id = ?').run(s.sessionId);
    db.prepare('DELETE FROM sessions WHERE session_id = ?').run(s.sessionId);

    db.prepare(
      `INSERT INTO sessions (
        session_id, source, cwd, project, title, transcript_path, cc_versions, parser_id, parser_status, entrypoint,
        started_at, ended_at, duration_ms, turns, messages, sidechain_messages, partial_messages,
        input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, sidechain_tokens,
        cost_usd, sidechain_cost_usd, unpriced_tokens, unpriced_models, models, switches, compactions,
        cost_state, parse_stats, pricing_hash, recorder_version, transcript_sig, first_recorded_at, recorded_at
      ) VALUES (
        :session_id, :source, :cwd, :project, :title, :transcript_path, :cc_versions, :parser_id, :parser_status, :entrypoint,
        :started_at, :ended_at, :duration_ms, :turns, :messages, :sidechain_messages, :partial_messages,
        :input_tokens, :output_tokens, :cache_write_tokens, :cache_read_tokens, :sidechain_tokens,
        :cost_usd, :sidechain_cost_usd, :unpriced_tokens, :unpriced_models, :models, :switches, :compactions,
        :cost_state, :parse_stats, :pricing_hash, :recorder_version, :transcript_sig, :first_recorded_at, :recorded_at
      )`,
    ).run({
      session_id: s.sessionId,
      source: s.source,
      cwd: s.cwd,
      project: s.project,
      title: s.title,
      transcript_path: s.transcriptPath,
      cc_versions: JSON.stringify(s.ccVersions),
      parser_id: s.parserId,
      parser_status: s.parserStatus,
      entrypoint: s.entrypoint,
      started_at: s.startedAt,
      ended_at: s.endedAt,
      duration_ms: s.durationMs,
      turns: s.turns,
      messages: s.messageCount,
      sidechain_messages: s.sidechainMessageCount,
      partial_messages: s.partialMessages,
      input_tokens: s.tokens.input,
      output_tokens: s.tokens.output,
      cache_write_tokens: s.tokens.cacheWrite,
      cache_read_tokens: s.tokens.cacheRead,
      sidechain_tokens: totalTokens(s.sidechainTokens),
      cost_usd: s.costUsd,
      sidechain_cost_usd: s.sidechainCostUsd,
      unpriced_tokens: s.unpricedTokens,
      unpriced_models: JSON.stringify(s.unpricedModels),
      models: JSON.stringify(s.models),
      switches: s.switches.length,
      compactions: s.compactions.length,
      cost_state: s.costState ? JSON.stringify(s.costState) : null,
      parse_stats: JSON.stringify(s.stats),
      pricing_hash: meta.pricingHash,
      recorder_version: RECORDER_VERSION,
      transcript_sig: meta.sig,
      first_recorded_at: prior?.first_recorded_at ?? now,
      recorded_at: now,
    });

    const insMsg = db.prepare(
      `INSERT INTO messages (session_id, msg_id, ts, model, input, output, cache_write, cache_write_1h, cache_read,
        web_search, speed, partial, cost_usd, priced, sidechain, agent_id, turn, seq)
       VALUES (:session_id, :msg_id, :ts, :model, :input, :output, :cache_write, :cache_write_1h, :cache_read,
        :web_search, :speed, :partial, :cost_usd, :priced, :sidechain, :agent_id, :turn, :seq)`,
    );
    s.messages.forEach((m, i) =>
      insMsg.run({
        session_id: s.sessionId,
        msg_id: m.id,
        ts: m.ts || null,
        model: m.model,
        input: m.input,
        output: m.output,
        cache_write: m.cacheWrite,
        cache_write_1h: m.cacheWrite1h,
        cache_read: m.cacheRead,
        web_search: m.webSearch,
        speed: m.speed,
        partial: m.stopReason === null ? 1 : 0,
        cost_usd: m.cost,
        priced: m.cost === null ? 0 : 1,
        sidechain: m.sidechain ? 1 : 0,
        agent_id: m.agentId,
        turn: m.turn,
        seq: i,
      }),
    );

    const insEv = db.prepare(
      `INSERT INTO events (session_id, kind, ts, turn, from_model, to_model, detail)
       VALUES (:session_id, :kind, :ts, :turn, :from_model, :to_model, :detail)`,
    );
    for (const sw of s.switches)
      insEv.run({
        session_id: s.sessionId,
        kind: 'model_switch',
        ts: sw.ts || null,
        turn: sw.turn,
        from_model: sw.from,
        to_model: sw.to,
        detail: null,
      });
    for (const c of s.compactions)
      insEv.run({
        session_id: s.sessionId,
        kind: 'compaction',
        ts: c.ts || null,
        turn: c.turn,
        from_model: null,
        to_model: null,
        detail: JSON.stringify({ trigger: c.trigger, preTokens: c.preTokens, postTokens: c.postTokens }),
      });
  });
}

/** All top-level session transcripts under ~/.claude/projects (subagent files are picked up per session). */
export function listTranscripts(): string[] {
  const root = path.join(claudeHome(), 'projects');
  const out: string[] = [];
  let projects: fs.Dirent[];
  try {
    projects = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const p of projects) {
    if (!p.isDirectory()) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, p.name), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) if (e.isFile() && e.name.endsWith('.jsonl')) out.push(path.join(root, p.name, e.name));
  }
  return out;
}

export interface BackfillResult {
  total: number;
  recorded: number;
  unchanged: number;
  empty: number;
  errors: { file: string; error: string }[];
}

export function recordAll(db: Db, table: PriceTable, opts: RecordOptions = {}): BackfillResult {
  const r: BackfillResult = { total: 0, recorded: 0, unchanged: 0, empty: 0, errors: [] };
  for (const f of listTranscripts()) {
    r.total++;
    try {
      const res = recordTranscript(db, table, f, opts);
      if (res.status === 'recorded') r.recorded++;
      else if (res.status === 'unchanged') r.unchanged++;
      else r.empty++;
    } catch (e) {
      r.errors.push({ file: f, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return r;
}
