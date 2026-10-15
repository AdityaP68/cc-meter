import type { Db } from './db.js';
import type { CostStateSnapshot } from './parser/types.js';

export interface Filters {
  since?: string; // ISO date or datetime (inclusive)
  until?: string; // exclusive
  project?: string;
  model?: string;
  source?: string;
}

export interface SessionRow {
  sessionId: string;
  source: string;
  project: string | null;
  cwd: string | null;
  title: string | null;
  /** The title, or a content-free fallback when Claude Code wrote none (see sessionLabel). Never null. */
  label: string;
  entrypoint: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  turns: number;
  messages: number;
  sidechainMessages: number;
  partialMessages: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
  unpricedTokens: number;
  unpricedModels: string[];
  models: { model: string; messages: number; cost: number; unpriced: boolean; input: number; output: number; cacheWrite: number; cacheRead: number }[];
  switches: number;
  compactions: number;
  parserStatus: string | null;
  ccVersions: string[];
  costState: CostStateSnapshot | null;
}

type Raw = Record<string, unknown>;

const ENTRYPOINT_KIND: Record<string, string> = { 'sdk-cli': 'headless run', 'claude-desktop': 'desktop session', cli: 'terminal session' };

/**
 * Display label for a session. Claude Code writes `custom-title`/`ai-title` only for some sessions (none for
 * `claude -p` runs since 2.1.264, rarely for short interactive ones; docs/FORMATS.md), so untitled sessions get a
 * deterministic label built from the entrypoint, main model and turn count. Never from prompt or reply text.
 */
export function sessionLabel(s: { title: string | null; entrypoint: string | null; models: { model: string }[]; turns: number }): string {
  if (s.title) return s.title;
  const ep = s.entrypoint;
  const kind = ep ? (ENTRYPOINT_KIND[ep] ?? (ep.startsWith('sdk-') ? 'SDK run' : `${ep} session`)) : 'session';
  const model = s.models[0]?.model.replace(/^claude-/, '').replace(/-\d{8}$/, '');
  return [kind, model, `${s.turns} ${s.turns === 1 ? 'turn' : 'turns'}`].filter(Boolean).join(' · ');
}

function mapSession(r: Raw): SessionRow {
  const input = Number(r.input_tokens);
  const output = Number(r.output_tokens);
  const cw = Number(r.cache_write_tokens);
  const cr = Number(r.cache_read_tokens);
  const title = (r.title as string) ?? null;
  const entrypoint = (r.entrypoint as string) ?? null;
  const models = JSON.parse(String(r.models));
  const turns = Number(r.turns);
  return {
    sessionId: String(r.session_id),
    source: String(r.source),
    project: (r.project as string) ?? null,
    cwd: (r.cwd as string) ?? null,
    title,
    label: sessionLabel({ title, entrypoint, models, turns }),
    entrypoint,
    startedAt: (r.started_at as string) ?? null,
    endedAt: (r.ended_at as string) ?? null,
    durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
    turns,
    messages: Number(r.messages),
    sidechainMessages: Number(r.sidechain_messages),
    partialMessages: Number(r.partial_messages),
    inputTokens: input,
    outputTokens: output,
    cacheWriteTokens: cw,
    cacheReadTokens: cr,
    totalTokens: input + output + cw + cr,
    costUsd: Number(r.cost_usd),
    unpricedTokens: Number(r.unpriced_tokens),
    unpricedModels: JSON.parse(String(r.unpriced_models)),
    models,
    switches: Number(r.switches),
    compactions: Number(r.compactions),
    parserStatus: (r.parser_status as string) ?? null,
    ccVersions: JSON.parse(String(r.cc_versions)),
    costState: r.cost_state ? JSON.parse(String(r.cost_state)) : null,
  };
}

/**
 * Sessions matching a filter: the same set `overview` counts (at least one message in the window, of the model when
 * one is given), so the table and the headline agree. Rows still carry whole-session totals.
 */
function sessionWhere(f: Filters, alias = 's'): { sql: string; params: Record<string, string> } {
  const w: string[] = [];
  const m: string[] = [];
  const p: Record<string, string> = {};
  if (f.since) (m.push('m.ts >= :since'), (p.since = f.since));
  if (f.until) (m.push('m.ts < :until'), (p.until = f.until));
  if (f.model) (m.push('m.model = :model'), (p.model = f.model));
  if (f.project) (w.push(`${alias}.project = :project`), (p.project = f.project));
  if (f.source) (w.push(`${alias}.source = :source`), (p.source = f.source));
  if (m.length) w.push(`EXISTS (SELECT 1 FROM messages m WHERE m.session_id = ${alias}.session_id AND ${m.join(' AND ')})`);
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

export type SessionSort = 'recent' | 'cost' | 'tokens';

export function listSessions(db: Db, f: Filters & { limit?: number; offset?: number; sort?: SessionSort } = {}): { total: number; rows: SessionRow[] } {
  const { sql, params } = sessionWhere(f);
  const order =
    f.sort === 'cost'
      ? 's.cost_usd DESC'
      : f.sort === 'tokens'
        ? '(s.input_tokens + s.output_tokens + s.cache_write_tokens + s.cache_read_tokens) DESC'
        : 's.started_at DESC';
  const total = (db.prepare(`SELECT COUNT(*) c FROM sessions s ${sql}`).get(params) as { c: number }).c;
  const rows = db
    .prepare(`SELECT s.* FROM sessions s ${sql} ORDER BY ${order} LIMIT :limit OFFSET :offset`)
    .all({ ...params, limit: f.limit ?? 100, offset: f.offset ?? 0 }) as Raw[];
  return { total, rows: rows.map(mapSession) };
}

export interface TurnRow {
  turn: number;
  ts: string | null;
  costUsd: number;
  sidechainCostUsd: number;
  unpricedTokens: number;
  tokens: number;
  messages: number;
  models: string[];
  /** Model of the last main-thread (non-subagent) message in the turn; null if the turn only has subagent messages. */
  mainModel: string | null;
}

export interface EventRow {
  kind: 'model_switch' | 'compaction';
  ts: string | null;
  turn: number | null;
  fromModel: string | null;
  toModel: string | null;
  detail: Record<string, unknown> | null;
}

export interface SessionDetail {
  session: SessionRow;
  turns: TurnRow[];
  events: EventRow[];
}

export function getSession(db: Db, sessionId: string): SessionDetail | null {
  const r = db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as Raw | undefined;
  if (!r) return null;
  const t = db
    .prepare(
      `SELECT turn,
              MIN(ts) AS ts,
              SUM(COALESCE(cost_usd, 0)) AS cost,
              SUM(CASE WHEN sidechain = 1 THEN COALESCE(cost_usd, 0) ELSE 0 END) AS side_cost,
              SUM(CASE WHEN priced = 0 THEN input + output + cache_write + cache_read ELSE 0 END) AS unpriced,
              SUM(input + output + cache_write + cache_read) AS tokens,
              COUNT(*) AS messages,
              GROUP_CONCAT(DISTINCT model) AS models,
              (SELECT m2.model FROM messages m2 WHERE m2.session_id = messages.session_id AND m2.turn = messages.turn AND m2.sidechain = 0 ORDER BY m2.seq DESC LIMIT 1) AS main_model
         FROM messages WHERE session_id = ? GROUP BY turn ORDER BY turn`,
    )
    .all(sessionId) as Raw[];
  const e = db.prepare('SELECT * FROM events WHERE session_id = ? ORDER BY ts, id').all(sessionId) as Raw[];
  return {
    session: mapSession(r),
    turns: t.map((x) => ({
      turn: Number(x.turn),
      ts: (x.ts as string) ?? null,
      costUsd: Number(x.cost),
      sidechainCostUsd: Number(x.side_cost),
      unpricedTokens: Number(x.unpriced),
      tokens: Number(x.tokens),
      messages: Number(x.messages),
      models: String(x.models ?? '').split(',').filter(Boolean),
      mainModel: (x.main_model as string) ?? null,
    })),
    events: e.map((x) => ({
      kind: x.kind as EventRow['kind'],
      ts: (x.ts as string) ?? null,
      turn: x.turn === null ? null : Number(x.turn),
      fromModel: (x.from_model as string) ?? null,
      toModel: (x.to_model as string) ?? null,
      detail: x.detail ? JSON.parse(String(x.detail)) : null,
    })),
  };
}

export interface RollupRow {
  key: string;
  sessions: number;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
  unpricedTokens: number;
}

/**
 * Rollups are computed from per-message rows, so a session that spans midnight is split across days
 * and a mixed-model session is split across models. Day buckets use the machine's local time zone.
 */
export function rollup(db: Db, by: 'day' | 'project' | 'model', f: Filters = {}): RollupRow[] {
  const w: string[] = [];
  const p: Record<string, string> = {};
  if (f.since) (w.push('m.ts >= :since'), (p.since = f.since));
  if (f.until) (w.push('m.ts < :until'), (p.until = f.until));
  if (f.project) (w.push('s.project = :project'), (p.project = f.project));
  if (f.source) (w.push('s.source = :source'), (p.source = f.source));
  if (f.model) (w.push('m.model = :model'), (p.model = f.model));
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const key = by === 'day' ? "date(m.ts, 'localtime')" : by === 'project' ? "COALESCE(s.project, '(unknown)')" : 'm.model';
  const rows = db
    .prepare(
      `SELECT ${key} AS k,
              COUNT(DISTINCT m.session_id) AS sessions,
              COUNT(*) AS messages,
              SUM(m.input) AS i, SUM(m.output) AS o, SUM(m.cache_write) AS cw, SUM(m.cache_read) AS cr,
              SUM(COALESCE(m.cost_usd, 0)) AS cost,
              SUM(CASE WHEN m.priced = 0 THEN m.input + m.output + m.cache_write + m.cache_read ELSE 0 END) AS unpriced
         FROM messages m JOIN sessions s ON s.session_id = m.session_id
         ${where}
        GROUP BY k ORDER BY ${by === 'day' ? 'k DESC' : 'cost DESC'}`,
    )
    .all(p) as Raw[];
  return rows.map((r) => ({
    key: String(r.k),
    sessions: Number(r.sessions),
    messages: Number(r.messages),
    inputTokens: Number(r.i),
    outputTokens: Number(r.o),
    cacheWriteTokens: Number(r.cw),
    cacheReadTokens: Number(r.cr),
    totalTokens: Number(r.i) + Number(r.o) + Number(r.cw) + Number(r.cr),
    costUsd: Number(r.cost),
    unpricedTokens: Number(r.unpriced),
  }));
}

export interface Overview {
  sessions: number;
  costUsd: number;
  totalTokens: number;
  unpricedTokens: number;
  unpricedModels: string[];
  switches: number;
  compactions: number;
  bySource: { source: string; sessions: number; costUsd: number; totalTokens: number }[];
  firstStartedAt: string | null;
  lastStartedAt: string | null;
}

/** Message-level WHERE (same semantics as the rollups and the daily chart: a message counts in the window it happened in). */
function messageWhere(f: Filters): { sql: string; params: Record<string, string> } {
  const w: string[] = [];
  const p: Record<string, string> = {};
  if (f.since) (w.push('m.ts >= :since'), (p.since = f.since));
  if (f.until) (w.push('m.ts < :until'), (p.until = f.until));
  if (f.project) (w.push('s.project = :project'), (p.project = f.project));
  if (f.source) (w.push('s.source = :source'), (p.source = f.source));
  if (f.model) (w.push('m.model = :model'), (p.model = f.model));
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', params: p };
}

/**
 * Totals for a filter. Tokens and cost come from per-message rows, exactly like the rollups and the daily chart, so the
 * headline equals the sum of the chart: a long session that started before the window still counts for what it spent
 * inside it, and a model filter counts only that model. Sessions = sessions with at least one message in the window.
 */
export function overview(db: Db, f: Filters = {}): Overview {
  const { sql, params } = messageWhere(f);
  const from = `FROM messages m JOIN sessions s ON s.session_id = m.session_id ${sql}`;
  const r = db
    .prepare(
      `SELECT COUNT(DISTINCT m.session_id) n, COALESCE(SUM(m.cost_usd),0) cost,
              COALESCE(SUM(m.input+m.output+m.cache_write+m.cache_read),0) tok,
              COALESCE(SUM(CASE WHEN m.priced = 0 THEN m.input+m.output+m.cache_write+m.cache_read ELSE 0 END),0) unp,
              MIN(s.started_at) first, MAX(s.started_at) last
         ${from}`,
    )
    .get(params) as Raw;
  const ids = `SELECT DISTINCT m.session_id ${from}`;
  const ev = db
    .prepare(`SELECT COALESCE(SUM(switches),0) sw, COALESCE(SUM(compactions),0) co FROM sessions WHERE session_id IN (${ids})`)
    .get(params) as Raw;
  const bySource = db
    .prepare(
      `SELECT s.source source, COUNT(DISTINCT m.session_id) n, COALESCE(SUM(m.cost_usd),0) cost,
              COALESCE(SUM(m.input+m.output+m.cache_write+m.cache_read),0) tok
         ${from} GROUP BY s.source ORDER BY cost DESC`,
    )
    .all(params) as Raw[];
  const unpricedModels = (db.prepare(`SELECT DISTINCT m.model u ${from} ${sql ? 'AND' : 'WHERE'} m.priced = 0 ORDER BY m.model`).all(params) as Raw[]).map((x) => String(x.u));
  return {
    sessions: Number(r.n),
    costUsd: Number(r.cost),
    totalTokens: Number(r.tok),
    unpricedTokens: Number(r.unp),
    unpricedModels,
    switches: Number(ev.sw),
    compactions: Number(ev.co),
    bySource: bySource.map((x) => ({ source: String(x.source), sessions: Number(x.n), costUsd: Number(x.cost), totalTokens: Number(x.tok) })),
    firstStartedAt: (r.first as string) ?? null,
    lastStartedAt: (r.last as string) ?? null,
  };
}

/** Distinct values for UI filter dropdowns. */
export function facets(db: Db): { projects: string[]; models: string[]; sources: string[]; unpriced: string[] } {
  const col = (sql: string) => (db.prepare(sql).all() as Raw[]).map((r) => String(Object.values(r)[0]));
  return {
    projects: col("SELECT DISTINCT project FROM sessions WHERE project IS NOT NULL ORDER BY project"),
    models: col('SELECT DISTINCT model FROM messages ORDER BY model'),
    sources: col('SELECT DISTINCT source FROM sessions ORDER BY source'),
    /** Models with at least one message that has no price, across all data (drives the upfront prompt). */
    unpriced: col('SELECT DISTINCT model FROM messages WHERE priced = 0 ORDER BY model'),
  };
}

export interface DayModelRow {
  day: string;
  model: string;
  costUsd: number;
  totalTokens: number;
  unpricedTokens: number;
}

/** Cost per local day per model, for the stacked daily chart. */
export function rollupDayModel(db: Db, f: Filters = {}): DayModelRow[] {
  const w: string[] = [];
  const p: Record<string, string> = {};
  if (f.since) (w.push('m.ts >= :since'), (p.since = f.since));
  if (f.until) (w.push('m.ts < :until'), (p.until = f.until));
  if (f.project) (w.push('s.project = :project'), (p.project = f.project));
  if (f.source) (w.push('s.source = :source'), (p.source = f.source));
  if (f.model) (w.push('m.model = :model'), (p.model = f.model));
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const rows = db
    .prepare(
      `SELECT date(m.ts, 'localtime') AS day, m.model AS model,
              SUM(COALESCE(m.cost_usd, 0)) AS cost,
              SUM(m.input + m.output + m.cache_write + m.cache_read) AS tok,
              SUM(CASE WHEN m.priced = 0 THEN m.input + m.output + m.cache_write + m.cache_read ELSE 0 END) AS unpriced
         FROM messages m JOIN sessions s ON s.session_id = m.session_id
         ${where} GROUP BY day, m.model ORDER BY day`,
    )
    .all(p) as Raw[];
  return rows
    .filter((r) => r.day)
    .map((r) => ({ day: String(r.day), model: String(r.model), costUsd: Number(r.cost), totalTokens: Number(r.tok), unpricedTokens: Number(r.unpriced) }));
}
