# Overview

sessionscope is a local-first usage and cost tracker for Claude Code. It answers three questions without sending anything off your machine: **what did my sessions cost, which models did they use, and did anything unusual happen** (model switches, compactions, subagent fan-out, calls that never reached the transcript).

## How it works

```
Claude Code plugin hooks  ->  recorder  ->  SQLite in ~/.sessionscope  ->  CLI + dashboard on 127.0.0.1
```

1. A small Claude Code plugin registers three hooks: `Stop` (a turn ended) and `SessionEnd` (the session ended) record the session, and `UserPromptSubmit` watches for the prompt `/sessionscope`. They run as separate processes. The two recording hooks print nothing; the `/sessionscope` hook prints one line (the dashboard address) only when you type exactly that prompt. Details in [Privacy](privacy.md) and the status line and command page ([Status line and /sessionscope](statusline-and-command.md)).
2. The hook hands the path of the session's transcript file to the recorder. The recorder re-reads the whole transcript, prices every API response, and writes the result into a SQLite database. It is idempotent: recording a session twice gives the same rows.
3. The `sessionscope` command line (`report`, `doctor`, `export`) and a local dashboard read that database. The dashboard server listens on `127.0.0.1` only.

## Who it is for

Developers who use Claude Code and want to see where their tokens and dollars go, per day, project, model and session, and who want to know how far those numbers can be trusted. It is built for one person on one machine. There are no accounts, teams or shared servers.

## What you get

- Every Claude Code session recorded automatically: tokens, estimated cost, models, turns, duration. Your existing history is backfilled on install.
- Cost per day (stacked by model), per project, per model and per turn. See [Measures](measures.md) for the vocabulary and [Costs](costs.md) for how the dollar figure is computed.
- Events worth knowing about: model switches, compactions, subagent cost, shown on the session page.
- A cross-check of every session that has a Claude Code cost record against Claude Code's own accounting, with the differences explained rather than hidden. Sessions without such a record cannot be checked. See [Accuracy](accuracy.md) and the [Health page](#/health).
- Warnings when a model has no price, when Claude Code's transcript format changes, or when hooks are missing (`sessionscope doctor` and the Health page).

## Sources

Claude Code is the first supported source. The design does not assume it is the only one: every session carries a `source` column (`claude-code` for everything recorded today), and the dashboard has a Source filter. **No other source exists today.** There is no Copilot, Cursor or API-log support, and none is planned in a way you can rely on.

## What it does not do

- **It is not your bill.** Costs are estimates at list price computed from token counts. Subscriptions, discounts and credits are not modelled. See [Costs](costs.md).
- **No quality scores yet.** Grading prompts or summarising sessions needs a prompt reviewer. That reviewer is planned and not released; `sessionscope review` is a stub that says so.
- **No leaderboards, by design.** sessionscope never ranks people.
- **It does not watch a session live.** Numbers update when a turn ends (the status line recalculates from the transcript each time Claude Code redraws it).
- **It does not see what Claude Code does not write to the transcript.** Some billed calls never appear there. sessionscope detects and estimates this where it can, and says so where it cannot. See [Accuracy](accuracy.md).

## Where to go next

| You want to | Read |
|---|---|
| Understand the terms in the dashboard | [Measures](measures.md) |
| Know how a dollar figure is produced | [Costs](costs.md) |
| Know what is stored and what is not | [Privacy](privacy.md) |
| Know how far to trust the numbers | [Accuracy](accuracy.md) |
| Install it | [Install](install.md), then [First steps](first-steps.md) |
| Find your way around the dashboard | [Dashboard](dashboard.md) |
| Look up a command or flag | [Command line](cli.md) |
| Change settings or add a price | [Configuration and pricing](config-and-pricing.md) |
| Fix a problem | [Troubleshooting](troubleshooting.md) |
