import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db.js';
import { buildDigest, type Digest } from './digest.js';
import { loadDetectorParams, runDetectors, type Flag } from './flags.js';
import {
  buildJudgeInput,
  DEFAULT_REVIEW_MODEL,
  estimateReview,
  RUBRIC_VERSION,
  runJudge,
  validateReview,
  type Estimate,
  type ReviewPayload,
} from './judge.js';
import { ccmeterHome } from './paths.js';
import type { PriceTable } from './pricing.js';
import { JUDGE_DIR_NAME, listTranscripts, recordTranscript, SOURCE_JUDGE } from './record.js';

/** What a review stores (ADR 0009 O1, owner's answer 2026-10-18): the judge's own summary and per-prompt notes, ids and counts. */
export interface StoredReview {
  sessionId: string;
  digestHash: string;
  rubricVersion: string;
  model: string;
  review: ReviewPayload;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Claude Code's own `total_cost_usd` for the judge run; null if it was not reported. */
  costUsd: number | null;
  createdAt: string;
}

interface Row {
  session_id: string;
  digest_hash: string;
  rubric_version: string;
  model: string;
  summary_json: string;
  prompt_scores_json: string;
  review_input_tokens: number | null;
  review_output_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
}

const fromRow = (r: Row): StoredReview => ({
  sessionId: r.session_id,
  digestHash: r.digest_hash,
  rubricVersion: r.rubric_version,
  model: r.model,
  review: { summary: JSON.parse(r.summary_json), prompt_scores: JSON.parse(r.prompt_scores_json) },
  inputTokens: r.review_input_tokens,
  outputTokens: r.review_output_tokens,
  costUsd: r.cost_usd,
  createdAt: r.created_at,
});

export function getReview(db: Db, key: { sessionId: string; digestHash: string; rubricVersion: string; model: string }): StoredReview | null {
  const r = db
    .prepare('SELECT * FROM reviews WHERE session_id = ? AND digest_hash = ? AND rubric_version = ? AND model = ?')
    .get(key.sessionId, key.digestHash, key.rubricVersion, key.model) as Row | undefined;
  return r ? fromRow(r) : null;
}

/** Newest stored review of a session (any digest, rubric or model), for showing "an older review exists". */
export function latestReview(db: Db, sessionId: string): StoredReview | null {
  const r = db.prepare('SELECT * FROM reviews WHERE session_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(sessionId) as Row | undefined;
  return r ? fromRow(r) : null;
}

export function saveReview(db: Db, r: StoredReview): void {
  db.prepare(
    `INSERT OR REPLACE INTO reviews (session_id, digest_hash, rubric_version, model, summary_json, prompt_scores_json,
       review_input_tokens, review_output_tokens, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(r.sessionId, r.digestHash, r.rubricVersion, r.model, JSON.stringify(r.review.summary), JSON.stringify(r.review.prompt_scores), r.inputTokens, r.outputTokens, r.costUsd, r.createdAt);
}

export interface Overhead {
  reviews: number;
  /** Sum of the reviews' own costs; reviews with an unreported cost are counted in `unreportedCost`, never as $0. */
  costUsd: number;
  unreportedCost: number;
  judgeSessions: number;
  /** Cost of the judge sessions as ccmeter derived it from their transcripts (null when none is priced). */
  judgeSessionsCostUsd: number | null;
}

/** The tool's own cost (docs/ARCHITECTURE.md §4): never part of "your usage" totals, always shown on its own. */
export function reviewOverhead(db: Db, since?: string): Overhead {
  const w = since ? 'WHERE created_at >= ?' : '';
  const a = (since ? [since] : []) as string[];
  const r = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(cost_usd),0) c, COALESCE(SUM(CASE WHEN cost_usd IS NULL THEN 1 ELSE 0 END),0) u FROM reviews ${w}`).get(...a) as { n: number; c: number; u: number };
  const sw = since ? "AND started_at >= ?" : '';
  const j = db
    .prepare(`SELECT COUNT(*) n, SUM(cost_usd) c FROM sessions WHERE source IN ('ccmeter-judge', 'agent-lens-judge', 'sessionscope-judge') ${sw}`)
    .get(...a) as { n: number; c: number | null };
  return { reviews: r.n, costUsd: r.c, unreportedCost: r.u, judgeSessions: j.n, judgeSessionsCostUsd: j.n ? j.c : null };
}

export interface ReviewConfig {
  model: string;
  consent: { at: string; version: number } | null;
}

const CONSENT_VERSION = 1;

function readConfig(home = ccmeterHome()): Record<string, unknown> {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8'));
    return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  } catch {
    return {};
  }
}

export function loadReviewConfig(home = ccmeterHome()): ReviewConfig {
  const r = (readConfig(home).review ?? {}) as Record<string, unknown>;
  const c = r.consent as Record<string, unknown> | undefined;
  return {
    model: typeof r.model === 'string' && r.model ? r.model : DEFAULT_REVIEW_MODEL,
    consent: c && typeof c.at === 'string' && c.version === CONSENT_VERSION ? { at: c.at, version: CONSENT_VERSION } : null,
  };
}

/** Remember the first-review consent in config.json, keeping every other key. */
export function storeConsent(home = ccmeterHome()): void {
  const cfg = readConfig(home);
  const review = { ...((cfg.review ?? {}) as Record<string, unknown>), consent: { at: new Date().toISOString(), version: CONSENT_VERSION } };
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ ...cfg, review }, null, 2) + '\n');
}

export interface Prepared {
  sessionId: string;
  digest: Digest;
  digestHash: string;
  flags: Flag[];
  model: string;
  rubricVersion: string;
  /** The exact text that would be sent to the judge. */
  input: string;
  estimate: Estimate;
  cached: StoredReview | null;
}

/** Everything that costs no tokens: digest, flags, the exact payload, the estimate, and whether a cached review makes the call unnecessary. */
export function prepareReview(db: Db, sessionId: string, o: { table: PriceTable; model: string; home?: string }): Prepared {
  const { digest, hash } = buildDigest(db, sessionId, { table: o.table });
  const flags = runDetectors(digest, { params: loadDetectorParams(o.home) });
  const input = buildJudgeInput(digest, flags);
  return {
    sessionId,
    digest,
    digestHash: hash,
    flags,
    model: o.model,
    rubricVersion: RUBRIC_VERSION,
    input,
    estimate: estimateReview(digest, input, o.model, o.table),
    cached: getReview(db, { sessionId, digestHash: hash, rubricVersion: RUBRIC_VERSION, model: o.model }),
  };
}

/** Where `claude -p` runs the judge, so its sessions are one recognisable project. */
export const judgeCwd = (home = ccmeterHome()) => path.join(home, JUDGE_DIR_NAME);

export interface Executed {
  stored: StoredReview;
  quotesRemoved: number;
  /** Whether the judge's own run was recorded (tagged ccmeter-judge) into the DB. */
  judgeSessionRecorded: boolean;
}

/** Record the judge run's transcript as a session tagged `ccmeter-judge`. Best effort: a failure must not lose the review. */
export function recordJudgeSession(db: Db, table: PriceTable, judgeSessionId: string): boolean {
  const file = listTranscripts().find((f) => path.basename(f, '.jsonl') === judgeSessionId);
  if (!file) return false;
  try {
    return recordTranscript(db, table, file, { source: SOURCE_JUDGE, force: true }).status === 'recorded';
  } catch {
    return false;
  }
}

/** The one paid step. Callers must have shown the estimate and obtained consent before calling it. */
export async function executeReview(db: Db, p: Prepared, o: { table: PriceTable; home?: string; timeoutMs?: number }): Promise<Executed> {
  const home = o.home ?? ccmeterHome();
  const cwd = judgeCwd(home);
  fs.mkdirSync(cwd, { recursive: true });
  const budget = Math.max(0.25, Math.ceil((p.estimate.costUsd ?? 1) * 4 * 100) / 100);
  const run = await runJudge({ model: p.model, input: p.input, cwd, maxBudgetUsd: budget, ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}) });
  // a run that returned an answer is paid for whether or not the answer validates, so it is recorded first. A run that fails
  // before answering (error, timeout) is not recorded here; `ccmeter record --all` picks its transcript up later.
  const judgeSessionRecorded = run.sessionId ? recordJudgeSession(db, o.table, run.sessionId) : false;
  const { review, quotesRemoved } = validateReview(run.payload, p.digest);
  const stored: StoredReview = {
    sessionId: p.sessionId,
    digestHash: p.digestHash,
    rubricVersion: p.rubricVersion,
    model: p.model,
    review,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    costUsd: run.costUsd,
    createdAt: new Date().toISOString(),
  };
  saveReview(db, stored);
  return { stored, quotesRemoved, judgeSessionRecorded };
}
