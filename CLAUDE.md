@AGENTS.md

# Claude Code specifics

- Hooks in `.claude/settings.json`: SessionStart runs `scripts/harness/orientation.mjs` (startup, resume,
  clear, compact); UserPromptSubmit + Stop run `scripts/harness/context-guard.mjs`, which asks for a
  hand-off at 180k tokens of context and requires one, once, at 300k. Treat orientation as the starting
  point for verification, not a substitute.
- Path-scoped rules in `.claude/rules/` load when you open matching files: parser & fixtures, pricing,
  database & recorder, plugin & install, dashboard & server, docs.
- Skills: `resume`, `handoff` (session continuity), `format-drift` (a new Claude Code release changed
  something), `dashboard-check` (visual verification), `react-check` (crash sweep,
  React pitfalls, review), `milestone-close`.
- Subagents: `transcript-surveyor` (read-only aggregates over `~/.claude/projects`; never returns raw
  text), `invariant-reviewer` (reviews a diff against the invariants above).
- Auto memory holds the user's preferences only; project knowledge lives in this repository.
