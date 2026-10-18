# First steps

A five-minute path from a fresh [install](install.md) to numbers you can read. Every command here exists; outputs are examples with placeholder values. If `sessionscope` is not on your PATH, run `npm link` in the clone first (or see [Troubleshooting](troubleshooting.md)).

## 1. Check the install

```bash
sessionscope doctor
```

Expected: a list of lines starting with a tick, an info sign, a warning sign or a cross, ending with a count such as `7 ok, 1 info, 0 warnings, 0 errors`. The command exits 0 unless a check is an error (exit 2).

One warning is common: "Claude Code x.y.z is newer than the newest version verified (2.1.295)". Recording continues; see [Accuracy](accuracy.md). If you see "Recorder hooks not found", the plugin was not installed (for example `claude` was not on PATH during setup): fix that and run `./install.sh` again, then restart Claude Code or run `/reload-plugins`.

## 2. Make sure your history is recorded

The install already backfilled. To repeat it (always safe; a repeat prints `recorded 0, unchanged N`):

```bash
sessionscope record --all
```

Expected on a first run:

```
Scanned 120 transcripts under ~/.claude/projects in 0.9s
  recorded 118, unchanged 0, skipped (no assistant messages) 2, errors 0
```

"Skipped" transcripts contain no real API call, so there is nothing to record.

## 3. Look at the numbers in the terminal

```bash
sessionscope report --limit 5
```

Expected: one header line with the session count, tokens and estimated cost, then a table of the five most recent sessions (id, start time in UTC, project, title, turns, duration, tokens, cost, switches, models). Cost is an estimate at list price, not your bill ([Costs](costs.md)).

## 4. Open the dashboard

In Claude Code, type `/sessionscope` and press Enter. A line appears with the dashboard address, usually `http://127.0.0.1:7337/`. Open it in your browser. It is designed to cost no model tokens (see the notes on that in [Status line and /sessionscope](statusline-and-command.md)).

From a shell instead:

```bash
sessionscope serve --open
```

This runs in the foreground: leave the terminal open, and press Ctrl-C to stop it.

Expected: the Sessions page with five cards (Estimated cost, Tokens, Sessions, Model switches, Compactions), a "Cost per day" chart and a sessions table. If the page shows no sessions, widen the Range filter to "All time".

## 5. Open one session

Click a session title. You get the session page: a cost-per-turn chart, a per-model table, an event list and a table titled "Check against Claude Code's own accounting".

- Each bar in "Cost per turn" is one turn of the conversation. Hover for details; "Show as table" gives the same data as a table.
- A hatched part of a bar is subagent cost. A dashed `▼` line is a model switch; a `◆` line is a compaction.
- In the check table, a green "match" means sessionscope read the transcript exactly as Claude Code counted it. "difference" is explained in [Accuracy](accuracy.md).

All of it is explained in [Dashboard](dashboard.md).

## 6. Optional: the status line

```bash
sessionscope setup --statusline
```

Expected: a line saying the `statusLine` entry was added to `~/.claude/settings.json`, with a backup path. The next time Claude Code redraws its status line it shows `model | cost | tokens`. This needs `sessionscope` on your PATH (`npm link`). See [Status line and /sessionscope](statusline-and-command.md).

## What happens from now on

You do not need to run anything. The plugin's hooks record a session when a turn ends (`Stop`) and when the session ends (`SessionEnd`); each time the whole transcript is re-read, so recording twice gives the same result. While the dashboard server runs it also rescans every 30 seconds, and the Refresh button rescans on demand.

> **Unverified:** the `Stop` hook is asynchronous, and in interactive Claude Code sessions it has not been observed running to completion. `SessionEnd` and the dashboard rescan cover the gap. If a recent session is missing, run `sessionscope record --all`.

Next: [Dashboard](dashboard.md), [Command line](cli.md), [Configuration and pricing](config-and-pricing.md).
