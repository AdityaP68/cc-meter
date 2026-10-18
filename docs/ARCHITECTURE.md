# Architecture

```
 Claude Code                         agent-lens (all local, no network)
 ───────────                         ─────────────────────────────────────────────────────────────
 writes transcripts ──────────────►  ~/.claude/projects/<proj>/<session>.jsonl  (+ <session>/subagents/*.jsonl)
 Stop / SessionEnd hook ──stdin──►   plugin/scripts/agent-lens.sh ─► agent-lens record ─┐
                                                                                  ▼
                                      core/parser (version-selected) ─► core/session ─► core/record ─► ~/.agent-lens/agent-lens.db (SQLite, WAL)
 `/agent-lens` (UserPromptSubmit) ───►   prompt-hook.sh ─► agent-lens serve --ensure ─► server/ (127.0.0.1) ─► dashboard SPA
 statusLine ──stdin──►                agent-lens statusline (reads transcript, cached)             ▲
                                      agent-lens report | doctor | export  ─────── core/aggregate ─┘
```

## Zero context footprint

Nothing agent-lens does runs inside the model's context. Measured with `claude plugin details agent-lens`:

| Component | Where it runs | Tokens added to a session |
|---|---|---|
| `Stop`, `SessionEnd` hooks | separate process spawned by Claude Code | 0 ("harness-only") |
| `UserPromptSubmit` hook (`/agent-lens`) | separate process; blocks the prompt, so no model call | 0 |
| `commands/agent-lens.md` (fallback `/agent-lens:agent-lens`) | a command is listed like a skill | ≈ 16 (listing only) |
| status line | separate process | 0 |
| dashboard server | detached process on 127.0.0.1 | 0 |
| M3 skill stub | shipped as `SKILL.md.stub`, not loaded | 0 (a loaded skill costs ≈ 39) |
| MCP server | **none, by design** | – |

`/agent-lens` is intercepted by a `UserPromptSubmit` hook that returns `{"continue":false,"stopReason":"<url>"}`, which stops the turn before any model call. Claude Code prefixes the reason (`Operation stopped by hook: <url>`), which agent-lens cannot change; its own text is just the URL. (`"decision":"block"` also works but adds an `Original prompt:` echo, so it is not used.) A plain slash command would instead trigger a model turn that re-reads the whole conversation (priced by the session's context size), so the command file exists only as a discoverable fallback. Drop `plugin/commands/agent-lens.md` to reach exactly 0 tokens.

## Modules

| Path | Responsibility |
|---|---|
| `core/parser/` | The **only** code that knows the transcript format. `types.ts` is the contract; `cc21.ts` parses Claude Code 2.1.x; `index.ts` selects a parser from the version found in the transcript and reports a status (`verified`, `unverified-newer/older`, `fallback`, `no-version`). |
| `core/session.ts` | Merges main + subagent parses, dedups by message id, assigns turns, detects model switches (main thread only), totals tokens and cost, flags unpriced models. |
| `core/pricing.ts`, `pricing.json` | Versioned price table, user override in `~/.agent-lens/pricing.json`, cost math. Unknown model → `null`, never 0. |
| `core/db.ts` | SQLite via `node:sqlite`, append-only migrations, WAL, `busy_timeout`. |
| `core/record.ts` | Idempotent recorder, backfill, source tagging. |
| `core/aggregate.ts`, `core/reconcile.ts`, `core/doctor.ts` | Queries shared by CLI and API; comparison with Claude Code's own `cost-state`; health checks. |
| `server/index.ts` | `node:http`, loopback only, JSON API + static SPA. |
| `dashboard/` | Vite + React + TS, hand-built SVG charts, no runtime network. Built to `dashboard/dist`. |
| `cli/` | `record`, `report`, `doctor`, `export`, `serve`, `statusline`, `setup`; `review` is the M3 stub. |
| `plugin/` | Claude Code plugin: hooks, launcher, command, M3 skill stub. |

There are **no runtime dependencies**; Vite, React, TypeScript and vitest are build/test tools only.

## Recording

`agent-lens record` is idempotent by construction: it recomputes the whole session from the transcript (plus its subagent files) and replaces that session's rows inside one `BEGIN IMMEDIATE` transaction. It first compares a signature (size+mtime of every file, price-table hash, recorder version) and exits without parsing when nothing changed. So `Stop` + `SessionEnd`, resumed sessions and a concurrent dashboard refresh are all safe; a crashed writer leaves the previous complete state.

- **Hook mode** (no flags, payload on stdin) never prints and always exits 0; problems go to `~/.agent-lens/record.log` (ids, status and timings only; no content).
- Sessions started by agent-lens's own judge carry `AGENT_LENS_JUDGE_RUNNING` in their environment and are stored with `source = agent-lens-judge`; the tag is sticky.
- The server also re-scans every 30 s and on start-up, so sessions missed by a crash or recorded before installation appear without a manual backfill.
- Full recompute is affordable: the largest transcript seen (46.6 MB) takes ≈ 0.2 s; SessionEnd's budget is 1.5 s.

## Schema (v1)

`sessions` (one row per session id, `source` column, totals, JSON for models/stats/cost-state), `messages` (one row per deduplicated API message: tokens, `cost_usd` NULL when unpriced, `sidechain`, `turn`, `partial`), `events` (`model_switch`, `compaction`), `reviews` (M3 placeholder, below), `meta`. Migrations are append-only in `core/db.ts`; `PRAGMA user_version` tracks the level.

Only counts, ids, model names, timestamps, the session title and the working directory are stored. **No prompt, reply, tool input or tool output text is ever stored**, and the `last_assistant_message` field of the Stop payload is never read.

## When Claude Code changes

1. A new release records its version in each transcript entry.
2. `selectParser` classifies it. Inside the verified range → `verified`. Same major.minor but newer → `unverified-newer` and `agent-lens doctor` warns, with the list of versions affected.
3. New entry types and new `usage.*` keys are counted per session (`parse_stats`) and listed by `doctor`, so a silent format change shows up as a warning, not as wrong numbers.
4. To support a format break: add `core/parser/ccNN.ts`, register it in `PARSERS`, add sanitized fixtures (`scripts/make-fixture.mjs`) and a golden file (`scripts/make-golden.mjs`), extend `docs/FORMATS.md`, bump `RECORDER_VERSION` so stored sessions are recomputed.

## Dashboard server hardening

Bound to `127.0.0.1` only (a test asserts it); `Host` must be a loopback name on the server's own port (DNS-rebinding guard); `POST` requires a custom header (forces a CORS preflight that is never granted, blocking cross-site requests); no CORS headers; CSP `default-src 'self'`; static path traversal blocked; idle shutdown after 4 h when started lazily.

---

# Milestone 3 design (not built in v1)

## Goal
Make quality visible, for improving prompts and workflows — **never for ranking people**. Reviews are per session; there is no per-developer aggregation, no identity field, and the dashboard will only roll up by project/model/rubric dimension.

## 1. Digest builder (deterministic, zero tokens)
`core/digest.ts` turns a recorded session into a compact, ordered structure, using only the transcript and the DB:

- per turn: user prompt text (length-capped, first N chars), assistant outcome flags, cost, tokens, tools used (names + counts), tool errors (`tool_result.is_error`), model, subagent calls;
- events: model switches, compactions (with pre/post tokens);
- no tool outputs, no file contents.

`digest_hash = sha256(canonical JSON of digest)`. Stored nowhere in plaintext except inside `~/.agent-lens`.

## 2. Heuristic flags (also zero tokens, computed from the digest)
| Flag | Signal |
|---|---|
| tool errors | `is_error` tool results; error rate per turn |
| retry loops | the same tool + near-identical input ≥ 3 times within a window |
| user corrections | a prompt right after an assistant turn that starts with, or contains, correction phrases ("no,", "that's wrong", "I said", "undo", "revert") |
| compactions | count, and prompts issued shortly after one (context loss risk) |
| **complaint signal** | a pluggable detector slot for user-complaint wording and its configurable parameter(s) |

The "complaint" detector is only a reserved slot in this design: M3 would add each detector as a module implementing one `Detector` interface, with per-detector parameters in `~/.agent-lens/config.json`. Nothing of it exists in code. It was requested by name, but its intended definition is not in the repository or in any earlier session available to the author; see `docs/ASSUMPTIONS.md`. Flags are shown on the session page as hints, never as scores of the person.

## 3. Judge (one structured call per review)
Input: the digest + rubric. Output (JSON schema enforced): `summary {goal, outcome, decisions[], open_issues[]}` and `prompt_scores[] {turn, clarity, context, scope, verifiability: 1..5, note, suggestion}`.

Cached in `reviews`, unique on `(session_id, digest_hash, rubric_version, model)`, so re-running an unchanged session with the same rubric and model is free. Each row stores the judge's own input/output tokens and cost.

### Decision: how to call the judge (A chosen 2026-10-15, ADR 0007)
| | A. `claude -p` subprocess | B. direct Messages API |
|---|---|---|
| Auth | reuses the user's Claude Code login; no API key handled by agent-lens | needs an API key stored/read by agent-lens |
| Network call from agent-lens's own code | none (Claude Code makes it) | yes (new dependency or `fetch`) |
| Structured output | `--output-format json` + schema in prompt | native `output_config.format` |
| Metering | the run is itself a Claude Code session: recorded by the hooks, tagged `agent-lens-judge`, cost read back from the transcript | `usage` from the response |
| Footprint risk | spawns a session (hooks fire; tagging avoids double counting) | none |
| Transcript text leaves the machine? | **yes**, to Anthropic, like any Claude Code use | **yes**, to Anthropic |

**Default: on-demand only** (`agent-lens review <id>`; no automatic reviews, no scheduled reviews), and **A** unless the owner approves B, because B adds agent-lens-made network calls and key handling. Either way the first review prompts for explicit consent, because it sends session text off the machine, and the command prints the estimated cost before running.

### Which model judges
Opus is **not** required. Prompt-quality grading against a rubric is a bounded classification/summarization task; a Sonnet-class model is the sensible default, cheap enough to run on demand. Offer `review.model` in config (Opus for a deeper critique of a specific session; Haiku for a cheap pass). Because `model` is part of the cache key, switching models never returns a stale review. Judge quality should be checked against a small hand-labelled set before the rubric is frozen.

### Out-of-process rule
`agent-lens review <id>` runs as its own process. The optional `convo-review` skill is a thin wrapper that invokes that command and prints the result; the digest is never loaded into the live session.

## 4. Overhead metering
Review cost is a first-class series: `reviews.cost_usd` and judge sessions (`source = agent-lens-judge`) are excluded from the "your usage" totals and shown separately ("Review overhead: $x this month, y reviews"), so the tool never hides its own cost.

## 5. Other ingest sources
`sessions.source` is already in the schema. A future `copilot-org` (or any other) importer writes sessions with its own `source` and its own parser module; the aggregation and UI are source-agnostic and already filter on it.
