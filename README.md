# ccmeter

Local-first usage, cost and model-switch tracking for Claude Code. A Claude Code plugin records every session into a small SQLite database under `~/.ccmeter`; a CLI and a local dashboard read it.

- **Nothing leaves your machine.** No network calls, no telemetry. Transcripts stay in `~/.claude`; ccmeter stores counts, ids, model names, timestamps and session titles in `~/.ccmeter`, never prompt, reply or tool text.
- **Nothing in your context.** Hooks, the status line and the dashboard run as separate processes. There is no MCP server. `/ccmeter` costs no model tokens.
- **No runtime dependencies.** Node ≥ 22.13 (uses the built-in `node:sqlite`).

## Install (git clone, under 5 minutes)

```bash
git clone <this repo> ccmeter && cd ccmeter
./install.sh
```

`install.sh` builds the CLI and dashboard, registers the clone as a local plugin marketplace, installs the plugin, creates `~/.ccmeter`, backfills your existing sessions and runs `ccmeter doctor`. Optional: `npm link` to put `ccmeter` on your PATH (the hooks work without it).

## Use

| | |
|---|---|
| `/ccmeter` in Claude Code | starts the dashboard if needed and shows its URL (one line, no model call) |
| `ccmeter serve --open` | dashboard in the foreground, opens your browser |
| `ccmeter report` | sessions table; `--by day\|project\|model`, `--since 7d`, `--session <id>` (detail + comparison with Claude Code's own totals) |
| `ccmeter doctor` | version, parser, unrecognized-format, pricing and hook checks; `--verify-pricing` |
| `ccmeter export --format csv` | counts and costs only |
| `ccmeter record --all` | (re)scan every transcript |
| `ccmeter setup --statusline` | add `model \| cost \| tokens` to Claude Code's status line (backs up settings.json) |
| `ccmeter setup --uninstall` | remove the plugin (data in `~/.ccmeter` is left alone) |

The dashboard has sessions with cost/tokens/model mix/duration/switches, a per-turn cost timeline with model-switch and compaction markers, rollups by day/project/model, and a Health page. Unpriced models and doctor warnings are shown on every page.

## How honest are the numbers?

Costs are **estimates at list price** computed from the token usage Claude Code writes into its transcripts. Where Claude Code recorded its own totals, ccmeter compares against them: token totals were identical for 306 of the 310 sessions that had one, and the price table reproduces Claude Code's own costs to the cent for the models it was checked on. Known gaps (subagent output tokens are a lower bound; interactive sessions can contain calls Claude Code bills but never writes down; sessions resumed across processes) are measured, flagged in the UI, and explained in [docs/FORMATS.md](docs/FORMATS.md). ccmeter shows both numbers rather than hiding the difference.

When Claude Code ships a new release, `ccmeter doctor` either confirms the format is still recognized or tells you exactly what is new.

## Docs
**Start here: [docs/USAGE.md](docs/USAGE.md)** (index of the guide in `docs/guide/`: install, concepts, dashboard, command reference, troubleshooting; the same pages are in the dashboard under Docs, `#/docs`).

[SCOPE](docs/SCOPE.md) · [FORMATS](docs/FORMATS.md) (what was inspected and found) · [ARCHITECTURE](docs/ARCHITECTURE.md) (incl. the milestone-3 review design) · [ASSUMPTIONS](docs/ASSUMPTIONS.md) · [ACCEPTANCE](docs/ACCEPTANCE.md)

## Develop
```bash
npm ci && npm run verify  # typecheck both projects, tests (against .test-dist/), repo checks; errors first
npm test                  # tests only
npm run typecheck         # CLI/core/server and dashboard
npm run build             # dist/ (CLI) and dashboard/dist/
```
Working on ccmeter with an AI agent: see [docs/harness.md](docs/harness.md) (instructions, hooks, rules, skills, checks). Enable the pre-commit checks once per clone with `git config core.hooksPath .githooks`.

Fixtures in `fixtures/` are sanitized real transcripts (`scripts/make-fixture.mjs`); golden files come from `scripts/make-golden.mjs` and are cross-checked by tests against an independent oracle and Claude Code's own `cost-state`.

Quality scores (milestone 3) are for improving prompts and workflows. ccmeter has no per-developer leaderboards and will not grow any.
