# ccmeter — Scope

ccmeter is a local-first usage and quality tracker for Claude Code. It ships as one git repo containing a Claude Code plugin, a CLI, and a local web dashboard.

It records per-conversation token usage, estimated cost and model switches, and shows them in a dashboard. Later milestones add heuristic quality flags and an on-demand LLM review that summarizes a session and grades its prompts.

## Hard constraints

1. **Local-first.** v1 makes no network calls. Transcripts contain proprietary code and never leave the machine. Any dependency or feature that would make a network call needs the owner's approval first.
2. **Zero context footprint.**
   - Hooks, the status line and the dashboard server run as separate processes.
   - There is no MCP server.
   - `/ccmeter` prints one line (the dashboard URL) and nothing else.
   - Any review skill is a thin wrapper around `ccmeter review <id>`. That command runs out of process and never loads the digest into the live session.
3. **Install-method independent.** It works the same via npx, a global install or a clone. It reads `~/.claude` and writes only under `~/.ccmeter` (SQLite DB and config). The repo contains no absolute paths.
4. **Publish-ready, not published.** The package has a `bin` entry and no machine-specific paths. v1 distribution is `git clone` + `./install.sh`.
5. **Stack.**
   - TypeScript on Node, with vitest for tests.
   - SQLite via `node:sqlite` or `better-sqlite3` (see Open decisions).
   - Dashboard: a small Vite + React + TS SPA, built to static files and served by the CLI's HTTP server bound to `127.0.0.1` only.

## Non-negotiable behaviors

- **No guessing external formats.** Hook payloads, statusLine JSON, plugin manifest and transcript JSONL are inspected for real. Findings go in `docs/FORMATS.md` with the Claude Code version noted. Ambiguities are stated, not assumed.
- **Parsers are fault tolerant.** Unknown fields and entry types are skipped and counted, never fatal. The parser is selected by recorded Claude Code version.
- **Unpriced is not free.** A model missing from `pricing.json` is stored as `unpriced`, never as zero, and is surfaced in `doctor` and the UI.
- **The recorder is idempotent.** It recomputes the whole session from the transcript and upserts by `session_id`, so running on both Stop and SessionEnd, and on resumed sessions, is safe.
- **Own-judge runs are tagged.** Sessions started by ccmeter's own judge (env `CCMETER_JUDGE_RUNNING`) are stored with `source=ccmeter-judge`.
- **No text storage outside `~/.ccmeter`.** Prompt or code text is never stored elsewhere without the owner's approval.
- **No leaderboards.** Quality scores exist to improve prompts and workflows. There are no per-developer rankings.

## In scope by milestone

**M1: core + recorder**
- Versioned, isolated transcript parser.
- Dedup of streaming duplicates by message id (keep the last).
- Explicit handling of sidechain/subagent messages (tagged, not counted as user-visible model switches).
- Synthetic messages ignored.
- Per message: model, input, output, cache_write and cache_read tokens.
- Per session: totals, cost, model list, model-switch events, compaction events, turn count, project/cwd.
- Pricing table, SQLite schema with migrations (including the `source` column and a `reviews` placeholder), `ccmeter record`, `ccmeter doctor`, and `install.sh`.
- Unit and golden-fixture tests.

**M2: dashboard + status line**
- Local API and SPA: sessions list, session detail (per-turn cost timeline with switch and compaction markers), rollups by day, project and model.
- `ccmeter serve` (lazy start, 127.0.0.1, optional browser open).
- The `/ccmeter` slash command.
- A statusLine command printing `model | session cost | tokens`.
- Unpriced models and doctor warnings shown in the UI.

**M3: design only** (documented in `ARCHITECTURE.md`, not built)
- Deterministic digest builder (no tokens).
- One structured judge call returning a summary and per-prompt scores.
- Results cached in `reviews`, keyed by (session_id, digest_hash, rubric_version, model).
- Heuristic flags: tool errors, retry loops, user corrections, compactions.
- Review overhead metered and shown on the dashboard.
- Judge via `claude -p` vs direct API: both documented, on-demand only by default.

## Out of scope for v1

- Any network call, telemetry or cloud sync.
- An MCP server.
- Multi-user or org aggregation, and per-developer rankings. The `source` column only leaves room for other ingest sources later.
- Publishing to npm.
- Automatic (non-on-demand) LLM review.

## Acceptance for v1

- Token totals match API-reported usage on a sample of real sessions. I will show 2–3 of your sessions and explain any discrepancy against what Claude Code itself reports.
- A new Claude Code release yields either correct data or a clear `doctor` warning.
- A teammate can go from clone to working dashboard in under 5 minutes.

## Environment observed (2026-10-14)

- Claude Code 2.1.287, Node v24.19.0, npm 11.17.0. `node:sqlite` is available.
- 624 transcript `.jsonl` files under `~/.claude/projects/`, enough for fixtures.
- `~/.ccmeter` does not exist yet.
- The working directory is not yet a git repo. I'll `git init` it as the first step of M1.

## Open decisions

1. **SQLite driver.** I recommend `node:sqlite`. It has no native build step and no extra dependency, which helps the 5-minute clone-to-dashboard goal. The cost is a Node >= 22.13 requirement, enforced in `engines` and checked by `doctor`. `better-sqlite3` would work on older Node but needs prebuilt binaries or a compiler toolchain. Default: `node:sqlite`.
2. **How the plugin hook finds the CLI.** Hooks must call `ccmeter record` without an absolute path. The documented mechanism for locating the plugin's own files (probably `${CLAUDE_PLUGIN_ROOT}`) needs checking against the current docs. The outcome goes in FORMATS.md. The fallback is `install.sh` linking `ccmeter` onto PATH.
3. **Judge mechanism** (`claude -p` vs direct API). Deferred to M3; it needs your approval because the API path makes a network call.

## Plan for M1 (after your OK)

1. `git init`, repo skeleton, TypeScript/vitest/ESLint-free minimal config, `.gitignore`.
2. **Research pass → `docs/FORMATS.md`.**
   - Read the current docs for hooks, statusLine and plugins/marketplaces.
   - Capture a real hook payload by registering a temporary logging hook.
   - Survey real transcripts: assistant entries and `usage`, streaming duplicates, sidechains, compaction entries, synthetic messages, and entry-type frequencies across Claude Code versions.
3. Sanitized golden fixtures from real transcripts, with a script that redacts text and paths and keeps the structure and usage numbers.
4. `core/`: parser interface plus a version-selected implementation, then pricing, schema and migrations, aggregation.
5. `cli/`: `record` (reads the hook payload from stdin), `doctor`, and a minimal `report` to check totals.
6. `plugin/` hooks (Stop + SessionEnd) and `install.sh`, using the documented install mechanism.
7. Tests throughout. Small commits.
8. **M1 acceptance.** Run `doctor`, then show token totals for 2–3 of your real sessions against what Claude Code reports, with any discrepancy explained.

I will not start step 1 until you approve this scope and plan, including the two default choices above.
