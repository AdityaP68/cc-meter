# agent-lens usage guide

agent-lens answers: **what did my Claude Code sessions cost, which models did they use, and did anything unusual happen** (model switches, compactions, subagent fan-out), all without leaving your machine.

## 1. What it can do

| Capability | Where |
|---|---|
| Records every Claude Code session automatically (tokens, estimated cost, models, turns, duration) | plugin hooks → `~/.agent-lens/agent-lens.db` |
| Detects **model switches** in the main conversation (with timestamps) and **compactions** (manual/auto, context before → after) | dashboard, `agent-lens report --session` |
| Counts **subagent** work separately and includes it in the session total | "sub N" badge, hatched bars |
| Shows cost per day (stacked by model), per project, per model, per turn | dashboard, `agent-lens report --by …` |
| Shows `model \| session cost \| tokens` in Claude Code's status line | `agent-lens setup --statusline` |
| Opens a local dashboard with one command | `/agent-lens` or `agent-lens serve --open` |
| Cross-checks itself against Claude Code's own totals | session page, `agent-lens report --session`, `agent-lens doctor` |
| Warns when a model has no price, when Claude Code's transcript format changes, when hooks are missing | `agent-lens doctor`, dashboard Health page and banner |
| Exports counts and costs (never text) | `agent-lens export` |
| Backfills your history on install and keeps itself current | `agent-lens record --all`, 30 s rescan while the dashboard runs |

### What it works with

- **Claude Code**, any way you run it: the terminal CLI, the Claude desktop app's Code tab, and headless `claude -p` runs. All write the same transcripts. Verified against Claude Code **2.1.236 – 2.1.295**.
- **Models priced out of the box:** Claude Fable 5/5.1, Opus 5.5/5/4.8/4.7/4.6, Sonnet 5.5/5/4.6, Haiku 5.5/4.5 (dated ids such as `claude-haiku-4-5-20251001` resolve automatically). Prices for Sonnet 5.5, Haiku 4.5 and Opus 5.5 are checked against Claude Code's own costs; the rest are list prices, labelled `list`. Any other model is shown as **unpriced**, never as $0, and you can add it yourself (§6).
- **Cache pricing:** separate rates for cache reads, 5-minute and 1-hour cache writes.
- **Platforms:** macOS is what it was built and tested on. Linux should work. Windows is untested (the plugin's hook scripts are POSIX `sh`). Needs Node ≥ 22.13.
- **Data sources:** only Claude Code transcripts today. The database has a `source` column so other sources can be added later; none exist yet.

### What it does not do (yet)
- No quality scores, prompt grading or session summaries: that is milestone 3, designed in [ARCHITECTURE.md](ARCHITECTURE.md) but not built. `agent-lens review` is a stub.
- It is not your bill. Costs are **estimates at list price** from the transcripts; subscriptions, discounts and credits are not modelled.
- It does not watch a session mid-turn: numbers update when a turn ends (the status line refreshes from the transcript every time Claude Code redraws it).
- No other tools (Copilot, Cursor, API logs) and no teams or accounts. By design there are no per-person leaderboards.

## 2. Install

```bash
git clone <repo> agent-lens && cd agent-lens
./install.sh            # builds, installs the Claude Code plugin, creates ~/.agent-lens, backfills history, runs doctor
npm link                # optional: puts `agent-lens` on your PATH (hooks work without it)
```

Needs Node ≥ 22.13 and the `claude` CLI on your PATH. Restart any running Claude Code session once so it loads the plugin (or run `/reload-plugins`).

## 3. Your first five minutes

1. **See the dashboard.** In Claude Code type `/agent-lens`. It starts a small local server (127.0.0.1 only) if needed and prints its URL; open it. Or from a shell: `agent-lens serve --open`.
2. **Look at "Cost per day"** and the sessions table. Click a session title.
3. **On the session page**, the *Cost per turn* chart shows one bar per user turn. Dashed ▼ lines are model switches, ◆ lines are compactions, hatched segments are subagent cost. Hover any bar for details; "Show as table" gives the same data as a table.
4. **Run `agent-lens doctor`.** Everything should be ✔; read any ⚠.
5. **(Optional) status line:** `agent-lens setup --statusline`.

From now on nothing needs to be run: the plugin records each session when it ends (and after each turn).

## 4. Reading the dashboard

**Sessions page**
- *Estimated cost*: list-price estimate from token usage. "+ unpriced" means part of the usage belonged to a model with no price and is **not** in the number.
- *Tokens*: input + output + cache reads + cache writes. Cache reads usually dominate; they are cheap per token.
- *Model switches*: changes of model between consecutive messages of the main conversation. A subagent running another model is **not** a switch.
- *Filters* (range, project, model, source) apply to the cards, the chart, and the table.
- Row badges: `⇄ n` switches · `◆ n` compactions · `sub n` messages from subagents · `≥ lower bound` some messages were saved mid-stream so output tokens are understated · `CC $x` Claude Code's own total for the session differs from ours by more than 5%.
- Each of the eight best-known Claude models has a fixed colour (so a model never changes colour when you filter or when a new model appears); any other model is shown in neutral grey. The legend above each chart is the key.

**Rollups page**: totals by day, project (working directory name) or model. Computed per message, so a session that runs past midnight is split across days.

**Session page**: header facts (Claude Code versions, parser status), per-model table, event list, and *Check against Claude Code's own accounting*: when Claude Code recorded its own per-model tokens, both are shown. **Equal = agent-lens read the transcript correctly.** A difference means one side sees calls the other doesn't (see [FORMATS.md](FORMATS.md) → Known discrepancies); agent-lens never silently prefers either.

**Health page**: the same checks as `agent-lens doctor`, plus how well the price table reproduces Claude Code's own costs.

## 5. Command reference

```bash
agent-lens report                         # latest 20 sessions + totals
agent-lens report --sort cost --limit 10  # most expensive sessions
agent-lens report --since 7d              # last 7 days (or an ISO date: --since 2026-10-01)
agent-lens report --by day                # also: --by project, --by model
agent-lens report --project my-repo --model claude-opus-5-5 --source claude-code
agent-lens report --session 3f47          # one session (unique id prefix is enough): events + comparison with Claude Code
agent-lens report --json                  # machine-readable (any of the above)

agent-lens doctor                         # health checks (exit code 2 if there is an error)
agent-lens doctor --verify-pricing        # does pricing.json reproduce Claude Code's own costs?

agent-lens export --format csv --out sessions.csv      # session totals, no text
agent-lens export --messages --format json             # one row per API message

agent-lens record --all                   # (re)scan every transcript; safe to repeat
agent-lens record --all --force           # recompute everything (e.g. after editing prices)
agent-lens record --session <id>          # one session

agent-lens serve --open                   # dashboard in the foreground, opens the browser
agent-lens serve --ensure --url-only      # start in the background if needed, print the URL
agent-lens serve --stop                   # stop the background server

agent-lens statusline                     # used by Claude Code's statusLine setting (reads JSON on stdin)
agent-lens setup --statusline             # add it to ~/.claude/settings.json (backs the file up first)
agent-lens setup --uninstall              # remove the plugin; your data is left in ~/.agent-lens
```

`/agent-lens` inside Claude Code = start/reuse the dashboard server and show its URL, without calling the model (no tokens).

## 6. Configuration

Everything lives under `~/.agent-lens` (override with `AGENT_LENS_HOME`; Claude Code's own folder is read from `~/.claude`, or `CLAUDE_CONFIG_DIR`).

`~/.agent-lens/config.json`
```json
{ "port": 7337, "openBrowser": false, "idleMinutes": 30 }
```
`port` is the preferred dashboard port (the next free one is used if taken). `openBrowser` opens a tab on `/agent-lens`. `idleMinutes` stops the background server after that long without requests (0 disables).

**Adding or overriding a model price**: create `~/.agent-lens/pricing.json` (same shape as the repo's `pricing.json`, only the models you want):
```json
{ "models": { "claude-some-new-model": {
  "input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite5m": 3.75, "cacheWrite1h": 6 } } }
```
Prices are USD per million tokens. Saved sessions are re-costed automatically the next time they are recorded (`agent-lens record --all`). An unpriced model shows up in `doctor` with its name and token count.

Earlier names: ccmeter, then sessionscope (ADR 0011). `agent-lens setup` copies the newest old folder (`~/.sessionscope` or `~/.ccmeter`) to `~/.agent-lens` once and leaves it in place; the old environment variables are still read.

Files: `agent-lens.db` (data), `record.log` (hook activity: ids and timings only), `server.json` (running server), `cli-path` (how the hooks find the CLI), `cache/` (status line cache).

## 7. Troubleshooting

| Symptom | What to do |
|---|---|
| `doctor` says hooks not found | `./install.sh` again, or `claude plugin list`; then restart Claude Code |
| A recent session is missing | It is recorded when the session ends; run `agent-lens record --all` (or open the dashboard, it rescans every 30 s) |
| "Unpriced" warning | Add the model to `~/.agent-lens/pricing.json` (§6) |
| Numbers differ from Claude Code's | Expected in some sessions: see the session page's comparison and [FORMATS.md](FORMATS.md) |
| `/agent-lens` shows "Operation stopped by hook: agent-lens dashboard: http://…" | That is the working message (Claude Code adds the prefix). Open the URL. If it still shows the older "blocked by hook … Original prompt" form, run `/reload-plugins` or restart Claude Code |
| Port busy | Set `port` in config.json, or `agent-lens serve --port 7400` |
| Claude Code updated and `doctor` warns | New format version: recording continues; check which entry types or fields are unrecognized. Details in [ARCHITECTURE.md](ARCHITECTURE.md) |
| Start over | `agent-lens serve --stop; rm ~/.agent-lens/agent-lens.db; agent-lens record --all` |

## 8. Privacy and safety

- No network calls; the dashboard listens only on `127.0.0.1`, checks the `Host` header and requires a custom header for writes.
- Stored: counts, ids, model names, timestamps, the session title and working directory. **Never stored:** prompts, replies, tool inputs/outputs; the hook payload's `last_assistant_message` is ignored.
- The database is a normal SQLite file; delete `~/.agent-lens` to remove everything.
- Uninstall: `agent-lens setup --uninstall`, then `npm unlink -g agent-lens` if you linked it.
