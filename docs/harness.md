# Agent harness for this repository

**Updated:** 2026-10-15
**Method:** the user's Context Harness guides (`context-and-loop-engineering.md`, `implementation-kit.md`, see
[references](references.md)), ported to Node so this repository stays Python-free. This file says what exists here and
what it costs; the guides say why.

## Baseline (measure first)

`node scripts/harness/metrics.mjs` reads agent-lens's own database (read-only). Before the harness, 2026-10-15:

| Project sessions | Main-thread requests | Context per request (median / p90 / max) | Main-thread cost paid at > 200k context | Cost |
|---:|---:|---|---:|---:|
| 1 (the build session) | 126 | 358k / 492k / 562k | **91 %** | $20.18 |

One long session carried the whole build: nearly every request re-sent more than a standard window. The context
guard and session continuity below target exactly that. **Re-measure** after a few sessions with the harness
(`--since 2026-10-15`) and compare median context and the > 200k share.

## Pieces

| # | Piece | Files | Loads | Resident cost (measured/estimated) | Enforces? |
|---|---|---|---|---|---|
| 1 | One instruction source | `AGENTS.md` (shared), `CLAUDE.md` = `@AGENTS.md` + Claude notes | every request | ≈ 1.3k tokens (5.3k chars) | no |
| 2 | Entry documents | `docs/current.md` (< 500 words), `docs/handoff.md` (`## Next`), `docs/status.md` | on demand | 0 | headers/size: yes |
| 3 | Orientation hook | `scripts/harness/orientation.mjs` via SessionStart | start, resume, clear, compact | ≈ 520 tokens per entry | no (injects) |
| 3b | Session continuity | skills `resume`, `handoff` | description always, body on use | ≈ 125 | no |
| 3c | Context guard | `scripts/harness/context-guard.mjs` via UserPromptSubmit + Stop | every prompt/stop | 0 unless it fires | **yes** (Stop exit 2 once ≥ 300k) |
| 4 | Path-scoped rules | `.claude/rules/{parser,pricing,database,plugin,dashboard,docs}.md` | when a matching file is read | 0 until matched (≈ 150–350 each) | no |
| 4b | Workflow skills | `format-drift`, `dashboard-check`, `react-check`, `milestone-close` | description always | ≈ 200 | no |
| 4c | Subagents | `transcript-surveyor` (aggregates only), `invariant-reviewer` (diff in, findings out) | description always | ≈ 180 | no |
| 5 | Checks that must hold | `scripts/harness/check.mjs`, `.githooks/pre-commit`, `core/migrations.lock.json` | on commit and in verify | 0 | **yes** |
| 6 | In-task verify loop | `npm run verify` (`scripts/harness/verify.mjs`) | when run | output capped at 2.5k chars | feedback |
| 7 | Permissions | `.claude/settings.json` allow (verify, tests, git reads, agent-lens reads) / deny (publish, reading `dist/`; `git push origin main` is allowed since 2026-10-18) | — | 0 | **yes** |
| 8 | Measurement | `scripts/harness/metrics.mjs` (dogfoods agent-lens) | when run | 0 | — |
| 9 | Durable knowledge | `docs/decisions/`, `docs/memory/lessons.md`, `docs/references.md` | on demand | 0 | — |

Fixed overhead added by the harness: **≈ 2.3k tokens** per session (instructions + listings), plus ≈ 520 per
start/compaction for orientation. Verified live (2026-10-15, headless): a session answered "branch, last tag,
handoff item 1" from the injected orientation alone, without tool calls. The context guard's Stop block fired
live in the interactive build session at ~581k tokens (2026-10-15) and was answered with this hand-off.

## What is specific to agent-lens

- **The live install.** The user's Claude Code runs this checkout (`dist/` for hooks, `plugin/` in place).
  Orientation says so every session and warns when `dist/` is older than the sources. `npm run verify` and
  `npm test` build into `.test-dist/`; only `npm run build` changes what the user runs.
- **Experiments vs the installed plugin.** Live `claude -p` probes disable it with
  `--settings '{"enabledPlugins":{"agent-lens@agent-lens":false}}'` (a lesson learned when it contaminated results).
- **Format drift is the main external risk.** Orientation compares `claude --version` with the parser's verified
  range; the `format-drift` skill is the procedure; the `transcript-surveyor` subagent keeps raw transcripts (large,
  private) out of the main context.
- **Privacy is enforced, not advised.** The pre-commit check blocks home paths, emails, API keys and the local
  username in staged files.
- **Shipped schema is frozen.** Migration v1 is in the user's real database; its hash is locked.

## How to work with it

| Situation | Do |
|---|---|
| New session | type `resume` (orientation already injected `## Next`) |
| While editing | `npm run verify -- --changed` (tests selected by vitest's import graph) |
| Before claiming done / committing | `npm run verify` (commits also run the pre-commit check) |
| End of a task, or the guard asks | skill `handoff`, then a fresh session + `resume` |
| Claude Code updated | skill `format-drift` |
| UI changed | skills `dashboard-check`, then `react-check` |
| Milestone | skill `milestone-close` |
| A lesson learned the hard way | `docs/memory/lessons.md`; a rule if it has a directory home; a check if it must never recur |

## Maintenance rules

- A rule that was broken twice becomes a check in `scripts/harness/check.mjs` (with a test in `tests/harness.test.ts`).
- Keep `CLAUDE.md` + `AGENTS.md` under 200 lines (enforced); move detail to rules, skills or docs.
- Do not add an MCP server or always-on context to this repository without measuring its resident cost first.
- Re-run `scripts/harness/metrics.mjs` after harness changes and record the comparison here.

## Not done (deliberately)

- No code-graph tooling: tasks here name their files; vitest's import graph already selects tests (`--changed`).
- No PostToolUse auto-typecheck: the verify command is cheap and explicit; an automatic hook adds latency per edit.
- No Codex-specific setup: `AGENTS.md` works for any agent that reads it; only Claude Code hooks are wired.
