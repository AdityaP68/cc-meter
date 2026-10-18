import readline from 'node:readline';
import { openDb, type Db } from '../../core/db.js';
import { loadPricing } from '../../core/pricing.js';
import { RUBRIC_VERSION } from '../../core/judge.js';
import { executeReview, loadReviewConfig, prepareReview, reviewOverhead, storeConsent, type Prepared, type StoredReview } from '../../core/review.js';
import { SOURCE_JUDGE } from '../../core/record.js';
import { flagStr, type Parsed } from '../args.js';
import { usd } from '../format.js';

export interface ReviewIo {
  /** True when a person can answer a question (stdin and stdout are terminals). */
  interactive: boolean;
  ask(question: string): Promise<string>;
}

function terminalIo(): ReviewIo {
  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY;
  return {
    interactive,
    ask: (q) =>
      new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(q, (a) => {
          rl.close();
          resolve(a.trim());
        });
      }),
  };
}

const CONSENT_TEXT = (p: Prepared) =>
  `Before the first review, please read this.
  A review sends text from your session off this machine: the prompts you typed (secrets, emails and home paths are
  masked first; each prompt is cut to its first 500 characters), the names and counts of the tools used, costs, token
  counts and events. It does NOT send tool output, file contents or assistant replies. Claude Code makes the call with
  your existing login, like any other use of Claude Code, so it reaches Anthropic and is billed to your account.
  agent-lens itself opens no connection and handles no key. Reviews run only when you ask, one session at a time.
  Masking is pattern based and partial: it cannot catch a secret with no recognisable shape.
  What stays here: the judge's summary and per-prompt notes (no quotes of your prompts) in ~/.agent-lens. Claude Code also
  keeps the judge run itself, which contains the masked prompts, as an ordinary session under ~/.claude/projects.
  See exactly what would be sent with: agent-lens review ${p.sessionId} --show-input`;

const costText = (p: Prepared) =>
  p.estimate.costUsd === null
    ? `cost unknown (${p.model} has no price in the table; the call itself is still billed)`
    : `about ${usd(p.estimate.costUsd)}`;

function resolveId(db: Db, prefix: string): { id?: string; error?: string } {
  if (!/^[0-9A-Za-z-]{1,64}$/.test(prefix)) return { error: 'a session id is letters, digits and dashes only (use the id or its first characters from `agent-lens report`)' };
  const rows = db.prepare('SELECT session_id, source FROM sessions WHERE session_id LIKE ? LIMIT 2').all(`${prefix}%`) as { session_id: string; source: string }[];
  if (rows.length === 0) return { error: `no recorded session "${prefix}" (try \`agent-lens record --all\`)` };
  if (rows.length > 1) return { error: `ambiguous session prefix "${prefix}"` };
  if (rows[0]!.source === SOURCE_JUDGE || rows[0]!.source === 'sessionscope-judge' || rows[0]!.source === 'ccmeter-judge') return { error: 'that session is a review run by agent-lens itself; review a normal session' };
  return { id: rows[0]!.session_id };
}

function printFlags(p: Prepared): void {
  if (!p.flags.length) {
    console.log('Hints from simple rules: none.');
    return;
  }
  console.log('Hints from simple rules (about the work, not scores of you; they can be wrong):');
  for (const f of p.flags) console.log(`  - ${f.detail}${f.turns.length ? ` [turn${f.turns.length === 1 ? '' : 's'} ${f.turns.join(', ')}]` : ''}`);
}

function printReview(s: StoredReview, p: Prepared, note: string): void {
  const r = s.review;
  console.log(`\nReview of session ${p.sessionId.slice(0, 8)} (${p.digest.session.turns} turns) by ${s.model}, rubric ${s.rubricVersion}${note}`);
  console.log(`\nGoal      ${r.summary.goal}`);
  console.log(`Outcome   ${r.summary.outcome.replace('_', ' ')}`);
  if (r.summary.decisions.length) console.log(`Decisions\n${r.summary.decisions.map((d) => `  - ${d}`).join('\n')}`);
  if (r.summary.open_issues.length) console.log(`Open issues\n${r.summary.open_issues.map((d) => `  - ${d}`).join('\n')}`);
  console.log('\nPrompt feedback (1 = poor, 5 = excellent):');
  for (const sc of r.prompt_scores) {
    console.log(`  turn ${sc.turn}  clarity ${sc.clarity}  context ${sc.context}  scope ${sc.scope}  verifiability ${sc.verifiability}`);
    console.log(`    ${sc.note}`);
    console.log(`    -> ${sc.suggestion}`);
  }
}

export async function runReview(args: Parsed, io: ReviewIo): Promise<number> {
  const prefix = args.positionals[0];
  if (!prefix) {
    console.error('usage: agent-lens review <session-id> [--model m] [--dry-run | --show-input] [--force] [--json] [--yes]');
    return 1;
  }
  const db = openDb();
  try {
    const found = resolveId(db, prefix);
    if (!found.id) {
      console.error(found.error);
      return 1;
    }
    const cfg = loadReviewConfig();
    const model = flagStr(args, 'model') ?? cfg.model;
    const p = prepareReview(db, found.id, { table: loadPricing(), model });
    const json = !!args.flags.json;
    const force = !!args.flags.force;

    if (args.flags['show-input']) {
      console.log(p.input);
      return 0;
    }
    if (p.cached && !force) {
      if (json) console.log(JSON.stringify({ sessionId: p.sessionId, cached: true, digestHash: p.digestHash, flags: p.flags, review: p.cached.review, model: p.model, rubricVersion: RUBRIC_VERSION, costUsd: p.cached.costUsd }, null, 2));
      else {
        printFlags(p);
        printReview(p.cached, p, `, cached from ${p.cached.createdAt.slice(0, 10)} (no new cost)`);
      }
      return 0;
    }
    if (args.flags['dry-run']) {
      if (json) console.log(JSON.stringify({ sessionId: p.sessionId, cached: false, digestHash: p.digestHash, flags: p.flags, estimate: p.estimate }, null, 2));
      else {
        printFlags(p);
        console.log(`\nNot run (--dry-run). A review would send about ${p.estimate.inputTokens} tokens to ${p.model}, ${costText(p)}. Add --show-input to see the exact text.`);
      }
      return 0;
    }

    if (!json) printFlags(p);
    // the estimate always reaches the person, also with --json (stderr keeps stdout machine readable)
    (json ? console.error : console.log)(`\nEstimated cost of a review: ${costText(p)} on ${p.model} (an estimate: ~${p.estimate.inputTokens} tokens in, ~${p.estimate.outputTokens} out).`);
    let confirmedNow = false;
    if (!cfg.consent) {
      if (!args.flags['accept-data-leaves-machine']) {
        console.error(CONSENT_TEXT(p));
        if (!io.interactive) {
          console.error('\nNo review was run: the first review needs your explicit consent. Run `agent-lens review <id>` in a terminal, or pass --accept-data-leaves-machine.');
          return 2;
        }
        const a = await io.ask('\nType "yes" to allow reviews and run this one: ');
        if (a.toLowerCase() !== 'yes') {
          console.error('Not run.');
          return 2;
        }
      }
      storeConsent();
      confirmedNow = true;
    }
    if (!confirmedNow && !args.flags.yes) {
      if (!io.interactive) {
        console.error('No review was run: confirm the cost with --yes (or run it in a terminal).');
        return 2;
      }
      const a = await io.ask('Run this review? [y/N] ');
      if (!/^y(es)?$/i.test(a)) {
        console.error('Not run.');
        return 2;
      }
    }

    const done = await executeReview(db, p, { table: loadPricing() });
    if (json) {
      console.log(JSON.stringify({ sessionId: p.sessionId, cached: false, digestHash: p.digestHash, flags: p.flags, review: done.stored.review, model: p.model, rubricVersion: RUBRIC_VERSION, costUsd: done.stored.costUsd, quotesRemoved: done.quotesRemoved }, null, 2));
    } else {
      printReview(done.stored, p, '');
      const o = reviewOverhead(db);
      console.log(`\nThis review cost ${done.stored.costUsd === null ? 'an unreported amount' : usd(done.stored.costUsd)} (Claude Code's figure). Review overhead so far: ${o.reviews} review${o.reviews === 1 ? '' : 's'}, ${usd(o.costUsd)}${o.unreportedCost ? ` + ${o.unreportedCost} unreported` : ''}; not included in your usage totals.`);
      if (done.quotesRemoved) console.log(`Note: ${done.quotesRemoved} span(s) copied from your prompts were removed from the stored review.`);
      if (!done.judgeSessionRecorded) console.log('Note: the review run itself could not be found in ~/.claude/projects to record it; run `agent-lens record --all` to catch up.');
    }
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  } finally {
    db.close();
  }
}

export async function cmdReview(args: Parsed): Promise<number> {
  return runReview(args, terminalIo());
}
