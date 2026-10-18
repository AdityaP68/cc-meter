# Privacy

sessionscope reads your Claude Code transcripts, which contain your conversations, and keeps only counts and a few labels. This page lists exactly what is stored, what is not, and what runs where.

## What is stored

Everything lives in one SQLite file, `~/.sessionscope/sessionscope.db`.

| Stored | Examples |
|---|---|
| Ids | session id (the transcript file name), message ids, agent id of a subagent |
| Counts | tokens per message (input, output, cache read, cache write 5m/1h), the turn each message belongs to, counts of messages, turns, switches and compactions, web-search request counts |
| Costs | estimated cost per message and per session, `NULL` for unpriced models |
| Model names | `claude-sonnet-5-5` and so on |
| Timestamps | session start and end, message time, event time |
| Title | the name Claude Code gave the session, if any |
| Working directory | the full `cwd` of the session, and its last folder name as the "project" |
| Transcript path | where Claude Code's transcript file for the session is |
| Claude Code's own totals | the per-model token and cost totals from its `cost-state` entry |
| Technical facts | Claude Code versions seen, entry point (`cli`, `claude-desktop`, `sdk-cli`), which parser was used, counts of entry types and unknown fields, event details such as a compaction's trigger and context sizes before and after |

> **Note:** the title, the working directory and the transcript path can identify you or your project, and a title can reflect what you worked on (see below). They are stored so the dashboard is readable, and titles and working directories are also written by `sessionscope export` (see [Configuration and pricing](config-and-pricing.md)). Other strings from the transcript (model names, entry point, version numbers, ids, names of unrecognised entry types) are stored too but are not content. Look at the database, an export or a screenshot before you share it.

The database also has a `reviews` table. It is an empty placeholder for the unreleased prompt reviewer; nothing writes to it.

## What is never stored

- **Prompt text, reply text, tool inputs and tool outputs.** The recorder reads each transcript line to count tokens and classify entries. It keeps only the fields in the table above. It copies no prompt or reply text.
- **One exception in spirit: titles.** A title is written by Claude Code, not by sessionscope. It is either a name you gave the session or a summary Claude Code generated from the conversation, so it can paraphrase or mention what you asked. sessionscope stores it as-is and shows it in the dashboard and the CLI, and `sessionscope export` includes it.
- **`last_assistant_message`.** Claude Code's hook payload contains the last reply as text (captured on Claude Code 2.1.287). sessionscope's hook code reads only the `transcript_path` field of that payload, and a test asserts that a planted reply string never reaches the database.
- **Labels for untitled sessions** are built from the entry point, model and turn count, never from text.

A small log, `~/.sessionscope/record.log`, notes each hook run: the event name, the session id, the outcome, and the time taken. If a hook fails, the error message is logged too, and such a message can contain a file path. The log is truncated when it passes 256 KB.

## Network

**sessionscope code makes no network calls.** There is no telemetry, no update check, no price download and no sign-in. The only sockets are:

- the dashboard server, listening on `127.0.0.1`;
- the command-line tool and the `/sessionscope` command, which probe that local server on `127.0.0.1` to see whether it is running.

`sessionscope doctor` runs `claude --version` and `claude plugin list` as local processes to read your Claude Code version and check that the plugin is installed; `sessionscope setup` runs `claude plugin` commands to install it. Installing from source runs `npm ci`, which downloads development packages; that is npm's network use at install time, not sessionscope's, and sessionscope has no runtime dependencies. Prices are a file in the repository that you edit yourself.

## The local server

The dashboard server is how you look at your data, so it is locked down as far as a local service can be:

- **Binds `127.0.0.1` only**, never `0.0.0.0` or `::`. It is not reachable from other machines.
- **Checks the `Host` header** and answers only to `127.0.0.1`, `localhost` or `[::1]` on its own port. This blocks DNS-rebinding attacks from web pages in your browser.
- **Requires a custom header on writes.** The only write endpoint is "rescan transcripts"; it needs `x-sessionscope: 1`. A custom header forces a browser preflight, and the server sends no CORS headers, so other web sites cannot trigger it.
- **Sends a strict Content-Security-Policy** (`default-src 'self'`, `connect-src 'self'`, plus inline styles and `data:` images), `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `frame-ancestors 'none'`. The dashboard loads no external fonts, scripts or images.
- **Stops by itself.** A server started by `/sessionscope` or `sessionscope serve --ensure` exits after `idleMinutes` (default 30) without requests.

> **Limit:** the server has no login. Any process on your machine that can reach `127.0.0.1` can read your sessions through the API. On a machine shared with other users, that includes them. Run it only on machines where you accept that.

> **Note:** sessionscope does not set file permissions. On a test run on 2026-10-19 with umask 022 the folder was created as 755 and the database as 644, so other users of the same machine could read them. Tighten them yourself on a shared machine.

## Zero context footprint

sessionscope adds nothing to what the model sees, apart from one small item noted below.

- **Hooks run out of process.** The plugin registers three hooks: `Stop` (asynchronous) and `SessionEnd` record the session; `UserPromptSubmit` looks for the exact prompt `/sessionscope`. The two recording hooks (`Stop`, `SessionEnd`) print nothing and always exit 0, so a missing `node` or a failure cannot break a session. The `UserPromptSubmit` hook also exits 0, and prints exactly one line, `{"continue":false,"stopReason":"sessionscope dashboard: <url>"}`, only when your prompt is `/sessionscope` (or `/sessionscope:sessionscope`); for any other prompt it prints nothing.
- **`/sessionscope` is designed to cost no model call.** Typing exactly `/sessionscope` makes the `UserPromptSubmit` hook start (or reuse) the local server and answer with the stop line above. Every other prompt passes through unchanged after one text match.
- **No MCP server.** The status line (if you enable it) and the dashboard server also run outside the conversation.
- **The one cost.** The plugin includes a command file, `/sessionscope:sessionscope`, as a fallback. Claude Code lists installed command names in context; the project's records (`docs/current.md`, decision of 2026-10-15) put this at about 16 tokens per session. That figure was not re-measured for this page.
- **The review skill is not installed.** It ships as a stub file that Claude Code does not load, because a loaded skill costs tokens in every session.

> **Unverified:** that Claude Code ends the turn on that output before calling the model (so nothing is billed), and the "Operation stopped by hook" prefix it puts in front of the line. The project observed both in headless runs (decision record 0003) but recorded no Claude Code version for them, and `docs/FORMATS.md` does not cover them. How `/sessionscope` renders in an interactive session is also unverified.

## The prompt reviewer

A prompt reviewer, which would grade prompts and summarise sessions, is **planned, not released**. `sessionscope review` prints that it is not implemented, and no released code sends session content anywhere.

## Where your data lives

| Path | Content |
|---|---|
| `~/.sessionscope/sessionscope.db` | The database |
| `~/.sessionscope/record.log` | Hook activity log |
| `~/.sessionscope/config.json` | Optional: `port`, `openBrowser`, `idleMinutes` |
| `~/.sessionscope/pricing.json` | Optional: your price overrides |
| `~/.sessionscope/server.json` | Pid and port of the running server |
| `~/.sessionscope/cli-path` | Where the hooks find the CLI |
| `~/.sessionscope/cache/` | Status line cache (cost, token counts, unpriced model names) |

Set `SESSIONSCOPE_HOME` to use another folder (all files and settings: [Configuration and pricing](config-and-pricing.md)). sessionscope reads Claude Code's transcripts from `~/.claude/projects` (or `$CLAUDE_CONFIG_DIR/projects`) and does not write there. If you used the tool under its earlier name, `sessionscope setup` copies `~/.ccmeter` to `~/.sessionscope` once and leaves the old folder in place; delete it yourself when you no longer need it.

## How to delete it

1. Stop the server: `sessionscope serve --stop`.
2. Remove the data: delete the `~/.sessionscope` folder. That is everything sessionscope has stored.
3. Remove the plugin: `sessionscope setup --uninstall` (this leaves your data alone, which is why step 2 is separate; see [Install](install.md)).
4. If you enabled the status line, remove the `statusLine` entry from `~/.claude/settings.json`. `setup --statusline` saved a backup next to that file (`settings.json.sessionscope-backup`) when it changed it.

Deleting the database does not touch your Claude Code transcripts, and `sessionscope record --all` rebuilds it from them. Conversely, sessionscope does not remove a session's row when Claude Code deletes its transcript; no code does so.
