# sessionscope — instructions for coding agents

Shared by every agent working here. Claude Code reads this file through the `@AGENTS.md` import in
`CLAUDE.md`. Shared rules go here; agent-specific notes go in that agent's file.

sessionscope is a local-first usage/cost tracker for Claude Code: plugin hooks → recorder → SQLite in
`~/.sessionscope` → CLI and a 127.0.0.1 dashboard. TypeScript on Node ≥ 22.13, zero runtime dependencies.

## Entry
1. Orientation is injected at session start (`scripts/harness/orientation.mjs`): Git state, Claude Code
   version against the parser's verified range, whether the user's **live install runs this checkout**,
   and the `## Next` steps of `docs/handoff.md`. Without the hook, run it yourself.
2. Read `docs/current.md` (bounded, under 500 words). To resume: do item 1 of `## Next`, stop where it says.
3. Retrieve everything else **on demand, by grep**, in 20–40-line windows. Do not read `docs/` linearly.

## Invariants (from docs/SCOPE.md; breaking one is a bug)
- **No network calls** from sessionscope code. Ask the user before adding any dependency that makes one.
- **Zero context footprint**: hooks/status line/server run out of process; no MCP server; `/sessionscope`
  prints one line without a model call; a review skill may only wrap `sessionscope review <id>`.
- **Never store prompt, reply or tool text** anywhere; the DB holds counts, ids, models, timestamps,
  titles and cwd only. Never commit personal data (enforced by `scripts/harness/check.mjs`).
- **Unpriced is never $0**: unknown models cost `NULL` and surface in `doctor` and the UI.
- **The recorder is idempotent** (full recompute + upsert). Hooks print nothing and always exit 0.
- **Do not guess external formats.** Facts about hooks, statusLine, plugins and transcripts come from
  observation, recorded in `docs/FORMATS.md` with the Claude Code version. Say what is unverified.
- **No per-developer leaderboards**, ever. Quality scores (M3) are for prompts and workflows.
- **Shipped migrations are immutable** (v1 is in users' databases; `core/migrations.lock.json`).

## The user's real installation
The user's Claude Code runs **this checkout**: hooks call `dist/cli/index.js` (via `~/.sessionscope/cli-path`)
and `plugin/` is loaded in place. So: verify before `npm run build`; a plugin edit is live at the next
session; never write to the user's `~/.claude` or `~/.sessionscope` while experimenting. Use isolated
`CLAUDE_CONFIG_DIR` / `SESSIONSCOPE_HOME` and, for live `claude -p` experiments, disable the installed
plugin with `--settings '{"enabledPlugins":{"sessionscope@sessionscope":false}}'` or its hooks contaminate results.

## Verify loop
- `npm run verify` — typecheck (both projects), tests against `.test-dist/`, repo checks; errors first, capped.
  It never touches `dist/`; `npm run build` is the deliberate step that updates the live install.
- `npm run verify -- --changed` — tests selected by import graph for the files you changed.
- `npm run verify -- --full` — also dashboard build and `claude plugin validate .`.
Run it before claiming anything works. A UI change also needs a look in the browser (`dashboard-check`, then `react-check`).

## Evidence and documentation
- After material work: one dated line in `docs/status.md` pointing at the commit. Reasoning belongs in
  commit bodies, not in docs.
- Durable choices → `docs/decisions/NNNN-*.md`. Reusable, evidence-backed lessons →
  `docs/memory/lessons.md` (and a path-scoped rule in `.claude/rules/` if it has a directory home).
- External sources that informed a decision → `docs/references.md` in the same change.
- Numbers about the user's data (session counts, costs) are dated and never include titles or paths.
- Before ending a session, at a milestone, or when the context guard asks: rewrite `## Next` in
  `docs/handoff.md` for an agent with no memory of the conversation (skill `handoff`).

## Commits
Small, logical commits; run `npm run verify` first. Pre-commit checks: `git config core.hooksPath .githooks`
(once per clone). Tag milestones `mN`. Pushing `main` to `origin` is allowed (owner decision 2026-10-18); never force-push, and never publish (npm etc.) without the user's explicit approval.

## Models
Routine implementation and fixes: Sonnet-class. Design, harness and review work: Opus-class. Bulk
read-only surveys: delegate to the `transcript-surveyor` subagent (cheaper model, isolated context).
