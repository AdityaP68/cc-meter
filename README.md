# sessionscope

Local-first usage, cost and model-switch tracking for Claude Code. A Claude Code plugin records every session into a small SQLite database under `~/.sessionscope`; a CLI and a local dashboard read it.

- **Nothing leaves your machine.** No network calls, no telemetry. Transcripts stay in `~/.claude`; sessionscope stores counts, ids, model names, timestamps and session titles in `~/.sessionscope`, never prompt, reply or tool text.
- **Nothing in your context.** Hooks, the status line and the dashboard run as separate processes. There is no MCP server. `/sessionscope` costs no model tokens.
- **No runtime dependencies.** Node ≥ 22.13 (uses the built-in `node:sqlite`).

## Install (git clone, under 5 minutes)

```bash
git clone <this repo> sessionscope && cd sessionscope
./install.sh
```

`install.sh` builds the CLI and dashboard, registers the clone as a local plugin marketplace, installs the plugin, creates `~/.sessionscope`, backfills your existing sessions and runs `sessionscope doctor`. Optional: `npm link` to put `sessionscope` on your PATH (the hooks work without it).

## Use

| | |
|---|---|
| `/sessionscope` in Claude Code | starts the dashboard if needed and shows its URL (one line, no model call) |
| `sessionscope serve --open` | dashboard in the foreground, opens your browser |
| `sessionscope report` | sessions table; `--by day\|project\|model`, `--since 7d`, `--session <id>` (detail + comparison with Claude Code's own totals) |
| `sessionscope doctor` | version, parser, unrecognized-format, pricing and hook checks; `--verify-pricing` |
| `sessionscope export --format csv` | counts and costs only |
| `sessionscope record --all` | (re)scan every transcript |
| `sessionscope setup --statusline` | add `model \| cost \| tokens` to Claude Code's status line (backs up settings.json) |
| `sessionscope setup --uninstall` | remove the plugin (data in `~/.sessionscope` is left alone) |

The dashboard has sessions with cost/tokens/model mix/duration/switches, a per-turn cost timeline with model-switch and compaction markers, rollups by day/project/model, and a Health page. Unpriced models and doctor warnings are shown on every page.

## How honest are the numbers?

Costs are **estimates at list price** computed from the token usage Claude Code writes into its transcripts. Where Claude Code recorded its own totals, sessionscope compares against them: token totals were identical for 306 of the 310 sessions that had one, and the price table reproduces Claude Code's own costs to the cent for the models it was checked on. Known gaps (subagent output tokens are a lower bound; interactive sessions can contain calls Claude Code bills but never writes down; sessions resumed across processes) are measured, flagged in the UI, and explained in [docs/FORMATS.md](docs/FORMATS.md). sessionscope shows both numbers rather than hiding the difference.

When Claude Code ships a new release, `sessionscope doctor` either confirms the format is still recognized or tells you exactly what is new.

## Docs
**Start here: [docs/USAGE.md](docs/USAGE.md)** (what it can do, step-by-step guide, command reference, troubleshooting).

[SCOPE](docs/SCOPE.md) · [FORMATS](docs/FORMATS.md) (what was inspected and found) · [ARCHITECTURE](docs/ARCHITECTURE.md) (incl. the milestone-3 review design) · [ASSUMPTIONS](docs/ASSUMPTIONS.md) · [ACCEPTANCE](docs/ACCEPTANCE.md)

## Develop
```bash
npm ci && npm run verify  # typecheck both projects, tests (against .test-dist/), repo checks; errors first
npm test                  # tests only
npm run typecheck         # CLI/core/server and dashboard
npm run build             # dist/ (CLI) and dashboard/dist/
```
Working on sessionscope with an AI agent: see [docs/harness.md](docs/harness.md) (instructions, hooks, rules, skills, checks). Enable the pre-commit checks once per clone with `git config core.hooksPath .githooks`.

Fixtures in `fixtures/` are sanitized real transcripts (`scripts/make-fixture.mjs`); golden files come from `scripts/make-golden.mjs` and are cross-checked by tests against an independent oracle and Claude Code's own `cost-state`.

Quality scores (milestone 3) are for improving prompts and workflows. sessionscope has no per-developer leaderboards and will not grow any.
