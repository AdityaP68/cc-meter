# Command line

Every command is `sessionscope <command> [flags]`. This page matches `sessionscope --help` for version 0.1.0 and the behaviour of each command. If `sessionscope` is not on your PATH, run `npm link` in the clone, or call `node <clone>/dist/cli/index.js` instead.

| Command | Purpose |
|---|---|
| `record` | Record sessions into the database. |
| `report` | Sessions, rollups and one-session detail in the terminal. |
| `doctor` | Health checks and price verification. |
| `export` | Counts and costs as JSON or CSV. |
| `serve` | The local dashboard. |
| `statusline` | The Claude Code status line command. |
| `setup` | Register the plugin, create the data folder, backfill. |
| `review` | Not released. |

## Conventions

- Flags are `--flag value` or `--flag=value`. A flag followed by another flag, or by nothing, is a switch. Boolean switches never take a value.
- Everything is local. Commands read `~/.claude` (or `$CLAUDE_CONFIG_DIR`) and read and write `~/.sessionscope` (or `$SESSIONSCOPE_HOME`). See [Configuration and pricing](config-and-pricing.md).
- A session id may be any unique prefix. The id column in `report` shows the first 8 characters.
- `sessionscope --version` (also `version`) prints the version, `sessionscope help`, `--help`, `-h` or no command prints the usage text and exits 0. An unknown command prints the usage text after "unknown command: x" and exits 1.

Exit codes:

| Command | 0 | Non-zero |
|---|---|---|
| `record` (hook mode) | always, and it prints nothing | never |
| `record --all` | no errors | 1 if any transcript failed |
| `record --session` / `--transcript` | recorded or unchanged | 1 if the transcript was not found |
| `report` | success | 1 for an unknown or ambiguous `--session` |
| `doctor` | no check is an error (warnings still exit 0) | 2 if any check is an error |
| `serve` | started, reused or stopped | 1 if `--ensure` could not start the server |
| `setup` | done | 1 if the status line step failed (invalid `settings.json`) |
| `statusline`, `export` | always | never |
| `review` | never | always 1 |

## record

```bash
sessionscope record --all [--force] [--json]
sessionscope record --session <id> [--force] [--json]
sessionscope record --transcript <file> [--force] [--json]
sessionscope record            # hook mode: JSON payload on stdin
```

| Flag | Meaning |
|---|---|
| `--all` | Scan every transcript under `~/.claude/projects` and record what is new or changed. Prints `Scanned N transcripts ...` then `recorded n, unchanged n, skipped (no assistant messages) n, errors n`. |
| `--session <id>` | Record one session. Needs the **full** session id (the transcript file name without `.jsonl`), not a prefix. Prints `recorded: <id>  N messages, $x`, `unchanged: <id>` or similar. |
| `--transcript <file>` | Record one transcript file by path. |
| `--force` | Recompute even if nothing changed (for example after editing prices; see [Configuration and pricing](config-and-pricing.md)). |
| `--json` | Machine-readable output. For `--all`: `{ total, recorded, unchanged, empty, errors[] }`. |

Recording is idempotent: the whole session is re-read and upserted, so running it twice changes nothing. Transcripts with no real API call are skipped ("empty").

**Hook mode** (no `--all`, `--session` or `--transcript`) is what the plugin runs. It reads one Claude Code hook payload on stdin, records the session named by its `transcript_path`, prints nothing and exits 0 even on errors. It appends one line per call (timestamp, event, session id, status, milliseconds) to `~/.sessionscope/record.log`. The reply text that hook payloads can carry is never read.

## report

```bash
sessionscope report [--sort recent|cost|tokens] [--limit n] [--since 7d] [--project p] [--model m] [--source s] [--json]
sessionscope report --by day|project|model [filters] [--json]
sessionscope report --session <id> [--json]
```

| Flag | Meaning |
|---|---|
| `--limit n` | Rows in the session list. Default 20. A final line "… n more (use --limit)" says when rows are hidden. |
| `--sort` | `recent` (default), `cost` or `tokens`. Not shown in `--help`. |
| `--since` | Only messages from this time on. Either `Nd` (the last N days, for example `7d`) or an ISO date or date-time (`2026-10-01`). There is no `--until`. |
| `--project p` | Exact project name, which is the folder name of the session's working directory. |
| `--model m` | Exact model id as recorded, for example `claude-sonnet-5-5`. |
| `--source s` | Exact source. Only `claude-code` exists in practice. Not shown in `--help`. |
| `--by day\|project\|model` | A rollup instead of the session list. Days are your local dates. Any other value is ignored and the session list is printed. |
| `--session <id>` | One session in detail (below). |
| `--json` | JSON for any of the three views. |

**Session list.** First line: `N sessions, <tokens> tokens, <cost>`, with `  (unpriced: <models>)` when applicable. Then a table: `id`, `started` (UTC), `project`, `title`, `turns`, `dur`, `tokens`, `cost`, `sw` (model switches) and `models`. The totals cover activity inside the filters; each row is the whole session. An unpriced model shows as `$x+unpriced`, never as free, and a warning line precedes the output. JSON: `{ total, overview, sessions[] }`.

**Rollup.** Rows are sorted by cost, highest first (newest day first for `day`); sessions without a working directory group under `(unknown)`. A table with the grouping key, `sessions`, `tokens` and `cost`. JSON: an array with `key`, `sessions`, `messages`, token counts, `costUsd` and `unpricedTokens`.

**One session.** Id, title (or the generated label), working directory, time span, turn and message counts, Claude Code versions and parser status, token counts, cost, notes about hidden classifier calls or partial messages when they apply, switch and compaction counts, each event, and then a table per model comparing sessionscope with Claude Code's own `cost-state` entry. A `MATCH` row means all four counts are equal; a `delta` row shows sessionscope minus Claude Code. JSON: the session detail plus `reconciliation`. An id that matches nothing prints `no recorded session "x"` and exits 1; one that matches several prints `ambiguous session prefix`.

## doctor

```bash
sessionscope doctor [--verify-pricing] [--json]
```

Runs the health checks and prints one line per check: `✔` ok, `ℹ` info, `⚠` warning, `✘` error, with detail indented beneath anything that is not ok, then `n ok, n info, n warnings, n errors`. Exit code 2 if any check is an error. The list of checks, and what to do about each, is in [Troubleshooting](troubleshooting.md).

| Flag | Meaning |
|---|---|
| `--json` | An array of `{ id, level, title, detail? }`. |
| `--verify-pricing` | After the checks, a table per priced model: `model`, `basis`, `in-range` (sessions where Claude Code's cost falls inside the range the table predicts), `max outside`, `exact-token pairs` and `max abs err (exact)`. See [Configuration and pricing](config-and-pricing.md). |

`doctor` runs `claude --version` and `claude plugin list` to check the installed version and the hooks. It makes no network call of its own.

## export

```bash
sessionscope export [--format json|csv] [--messages] [--out file]
```

| Flag | Meaning |
|---|---|
| `--format` | `json` (default) or `csv`. Any other value gives JSON. |
| `--messages` | One row per API message instead of one row per session. |
| `--out file` | Write to a file instead of standard output. |

There are no filter flags: export always covers everything recorded. Columns and privacy notes are in [Configuration and pricing](config-and-pricing.md).

## serve

```bash
sessionscope serve [--port n] [--open]          # foreground
sessionscope serve --ensure [--url-only] [--open] [--port n]   # background, lazy
sessionscope serve --stop
```

| Flag | Meaning |
|---|---|
| (none) | Run the dashboard in the foreground and print `sessionscope dashboard: <url>  (127.0.0.1 only; Ctrl-C to stop)`. If one is already running it prints its address and exits. |
| `--port n` | Preferred port. If it is taken, the next free port is used (up to 20 tries). Default from `config.json`, else 7337. |
| `--open` | Open the dashboard in your browser (`open` on macOS, `xdg-open` on Linux, `start` on Windows; only macOS is verified). |
| `--ensure` | Reuse a running server or start a detached one, wait for it, and print its URL. This is what `/sessionscope` runs. Exits 1 with a message if it cannot start. |
| `--url-only` | With a running server, print just the URL. |
| `--stop` | Stop the background server recorded in `server.json`. |

The server listens on `127.0.0.1` only and rescans transcripts every 30 seconds. A server started with `--ensure` stops itself after `idleMinutes` (default 30) without a request; a foreground one runs until Ctrl-C. `config.json` can set `port`, `openBrowser` and `idleMinutes`. A running server loads the price table when it starts, so after editing `pricing.json` run `sessionscope serve --stop` and start it again.

## statusline

```bash
sessionscope statusline
```

Reads Claude Code's status line JSON on stdin and prints one line. It is meant to be run by Claude Code, not by hand; always exits 0. Details in [Status line and /sessionscope](statusline-and-command.md).

## setup

```bash
sessionscope setup [--no-backfill] [--statusline]
sessionscope setup --uninstall
```

| Flag | Meaning |
|---|---|
| (none) | Create `~/.sessionscope`, write `cli-path` and a default `config.json`, copy a legacy `~/.ccmeter` once, register the local marketplace and install the plugin (if `claude` is on PATH), and backfill. Safe to repeat. |
| `--no-backfill` | Skip recording existing transcripts. |
| `--statusline` | Also add the status line to `~/.claude/settings.json` (below). |
| `--uninstall` | Uninstall the plugin and marketplace, including the pre-rename `ccmeter` ones. Data is left in place. |

`--statusline` backs `settings.json` up to `settings.json.sessionscope-backup` first, and leaves it alone if a `statusLine` is already configured or if the file is not a valid JSON object (then it exits 1). A status line still using the old `ccmeter statusline` command is updated even without the flag.

## review

```bash
sessionscope review <session-id>
```

**Not released.** This is the stub for the planned prompt reviewer. In this version it prints "sessionscope review is milestone 3 and is not implemented yet. See docs/ARCHITECTURE.md." to standard error and exits 1. Nothing is stored or sent.
