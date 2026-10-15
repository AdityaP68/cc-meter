# Status log

**Updated:** 2026-10-15

Newest first. One line per material change, pointing at the commit or document. Reasoning lives in commit
bodies (`git show <sha>`); do not duplicate it here.

| Date | Change | Where |
|---|---|---|
| 2026-10-15 | Unpriced-model support (ADR 0008): upfront prompt (dashboard banner, status line, report), Claude Code's figure as stopgap, `doctor` derived-price suggestion | `7b830d5`, `33dab76`, `e8fbb3d` |
| 2026-10-15 | Flags column aligned; Health/doctor accuracy: synthetic-only transcripts not "unrecorded", price evidence per model (incl. models with nothing to compare), largest Claude Code cost gap named | `59acbe4`, `dee1894` |
| 2026-10-15 | Review fixes: unpriced never `$0` in reconciliation/MixBar/export; `pricing.json` override validated (doctor `pricing-override`); `readCostState` tolerates malformed `modelUsage`; race-safe `migrate()`; server `limit`/`offset` clamped; `setup --statusline` refuses an unparsable `settings.json` | `ad35679`, `ff2f6f4`, `3928220`, `d340407`, `1a098df`, `1d9019f` |
| 2026-10-15 | Owner decisions: compliance parameters, `node:sqlite`, M3 judge via `claude -p` | `docs/decisions/0007-compliance-parameters-and-m3-judge.md` |
| 2026-10-15 | Skill `react-check` (route sweep, React pitfall scan, crash debugging, review) and a happy-dom DOM smoke test for the dashboard | `.claude/skills/react-check/`, `tests/dashboard-dom.test.ts` |
| 2026-10-15 | User-reported fixes: nav blank page, untitled-session labels and Flags cell, overview totals = chart, hook exit 0; project review | `82bf4ae`, `a71f679`, `d391dc6`, `038ff40` |
| 2026-10-15 | Context harness for agents working on this repo: AGENTS/CLAUDE, entry docs, orientation + context-guard hooks, rules, skills, subagents, pre-commit checks, `npm run verify` | `docs/harness.md` |
| 2026-10-15 | `/ccmeter` prints only the URL (`continue:false` + `stopReason`) | `ba88527` |
| 2026-10-14 | Usage guide; fixed colour per known model | `af427fd` |
| 2026-10-14 | Installed on the user's machine from this checkout; live hook and `/ccmeter` verified headlessly | `docs/ACCEPTANCE.md` |
| 2026-10-14 | Docs: architecture with M3 design, assumptions, README, acceptance; classifier-request counting | `63a8273` |
| 2026-10-14 | M2: dashboard, API, status line; zero-token `/ccmeter` hook | `1a184aa`, `af4c01b`, tag `m2` |
| 2026-10-14 | M1: parser, pricing, schema, recorder, CLI, plugin, tests, FORMATS.md | `baca029`…`dd19e16`, tag `m1` |
| 2026-10-14 | Scope and plan agreed | `docs/SCOPE.md` |
