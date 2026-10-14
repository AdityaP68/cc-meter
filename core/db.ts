import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { dbPath, ensureHome } from './paths.js';

export type Db = DatabaseSync;

interface Migration {
  version: number;
  sql: string;
}

/** Append-only. Never edit a shipped migration; add a new one. */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'claude-code',
  cwd TEXT,
  project TEXT,
  title TEXT,
  transcript_path TEXT,
  cc_versions TEXT NOT NULL DEFAULT '[]',
  parser_id TEXT,
  parser_status TEXT,
  entrypoint TEXT,
  started_at TEXT,
  ended_at TEXT,
  duration_ms INTEGER,
  turns INTEGER NOT NULL DEFAULT 0,
  messages INTEGER NOT NULL DEFAULT 0,
  sidechain_messages INTEGER NOT NULL DEFAULT 0,
  partial_messages INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  sidechain_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  sidechain_cost_usd REAL NOT NULL DEFAULT 0,
  unpriced_tokens INTEGER NOT NULL DEFAULT 0,
  unpriced_models TEXT NOT NULL DEFAULT '[]',
  models TEXT NOT NULL DEFAULT '[]',
  switches INTEGER NOT NULL DEFAULT 0,
  compactions INTEGER NOT NULL DEFAULT 0,
  cost_state TEXT,
  parse_stats TEXT,
  pricing_hash TEXT,
  recorder_version INTEGER,
  transcript_sig TEXT,
  first_recorded_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_started ON sessions(started_at);
CREATE INDEX idx_sessions_project ON sessions(project);
CREATE INDEX idx_sessions_source ON sessions(source);

CREATE TABLE messages (
  session_id TEXT NOT NULL,
  msg_id TEXT NOT NULL,
  ts TEXT,
  model TEXT NOT NULL,
  input INTEGER NOT NULL,
  output INTEGER NOT NULL,
  cache_write INTEGER NOT NULL,
  cache_write_1h INTEGER NOT NULL,
  cache_read INTEGER NOT NULL,
  web_search INTEGER NOT NULL DEFAULT 0,
  speed TEXT,
  partial INTEGER NOT NULL DEFAULT 0,  -- 1 = final entry has stop_reason null (output_tokens is a lower bound)
  cost_usd REAL,              -- NULL = unpriced model, never 0
  priced INTEGER NOT NULL,
  sidechain INTEGER NOT NULL,
  agent_id TEXT,
  turn INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (session_id, msg_id)
);
CREATE INDEX idx_messages_session_turn ON messages(session_id, turn);
CREATE INDEX idx_messages_ts ON messages(ts);
CREATE INDEX idx_messages_model ON messages(model);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,         -- 'model_switch' | 'compaction'
  ts TEXT,
  turn INTEGER,
  from_model TEXT,
  to_model TEXT,
  detail TEXT
);
CREATE INDEX idx_events_session ON events(session_id);

-- Placeholder for Milestone 3 (see docs/ARCHITECTURE.md). Nothing writes here in v1.
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  digest_hash TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  model TEXT NOT NULL,
  summary_json TEXT,
  prompt_scores_json TEXT,
  review_input_tokens INTEGER,
  review_output_tokens INTEGER,
  cost_usd REAL,
  created_at TEXT NOT NULL,
  UNIQUE (session_id, digest_hash, rubric_version, model)
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
`,
  },
];

export const LATEST_SCHEMA = MIGRATIONS[MIGRATIONS.length - 1]!.version;

export function schemaVersion(db: Db): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

export function migrate(db: Db): void {
  let v = schemaVersion(db);
  for (const m of MIGRATIONS) {
    if (m.version <= v) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    v = m.version;
  }
}

export function openDb(file: string = dbPath()): Db {
  if (file !== ':memory:') {
    ensureHome();
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 5000');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  migrate(db);
  return db;
}

/** Run fn inside a transaction; rolls back on throw. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
