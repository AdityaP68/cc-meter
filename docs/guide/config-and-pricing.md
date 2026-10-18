# Configuration and pricing

Everything sessionscope keeps lives in one folder, `~/.sessionscope`. Configuration is optional: it works with no files other than the ones `setup` creates.

## Files

| Path | What it is | Safe to delete? |
|---|---|---|
| `sessionscope.db` | The SQLite database (WAL mode, so `-wal` and `-shm` files appear beside it while it is open). Counts, ids, models, timestamps, session titles and working directories. | Yes. `sessionscope record --all` rebuilds it from the transcripts that still exist. |
| `config.json` | Dashboard settings (below). Written by `setup` if missing. | Yes; defaults apply. |
| `pricing.json` | Your price additions and overrides (below). You create it. | Yes; the shipped prices apply. |
| `record.log` | One line per hook call: time, event, session id, status, milliseconds. Never any content. Emptied when it passes 256 KB. | Yes. |
| `server.json` | Process id, port and address of the running dashboard server. | Only after `sessionscope serve --stop`. |
| `cli-path` | The absolute path of the CLI. The hooks use it when `sessionscope` is not on PATH. | Re-created by `setup`. |
| `cache/` | Status line cache, one small file per session. | Yes. |

The repository ships its own `pricing.json` (the built-in prices); that file is separate from yours and is never edited by sessionscope.

## Environment variables

| Variable | Effect |
|---|---|
| `SESSIONSCOPE_HOME` | Use this folder instead of `~/.sessionscope`. `setup` then skips the `~/.ccmeter` copy. Used for sandboxes and tests. |
| `CCMETER_HOME` | The pre-rename name of the same setting, still honoured when `SESSIONSCOPE_HOME` is not set. |
| `CLAUDE_CONFIG_DIR` | Claude Code's own config folder. sessionscope reads transcripts from `$CLAUDE_CONFIG_DIR/projects` (default `~/.claude/projects`) and `settings.json` from there for the status line and the hooks check. Claude Code honours the same variable. |
| `SESSIONSCOPE_JUDGE_RUNNING` | Internal. Tags sessions recorded while it is set with the source `sessionscope-judge`, reserved for the unreleased prompt reviewer. You should not need it. `CCMETER_JUDGE_RUNNING` is the old name. |

The data folder is chosen in this order: `SESSIONSCOPE_HOME`, `CCMETER_HOME`, `~/.sessionscope`, and `~/.ccmeter` only while `~/.sessionscope` does not exist (before `setup` has copied it). Inside any folder, a database named `ccmeter.db` is used if `sessionscope.db` does not exist.

sessionscope never writes to the Claude Code folder, except that `setup --statusline` edits `settings.json` (after a backup) and `setup` runs `claude plugin` commands.

## config.json

```json
{ "port": 7337, "openBrowser": false, "idleMinutes": 30 }
```

| Key | Default | Meaning |
|---|---|---|
| `port` | 7337 | Preferred dashboard port. If it is busy the next free one is used (up to 20 tries). `--port` on the command line overrides it. A missing, zero or non-numeric value means 7337. |
| `openBrowser` | `false` | If `true`, `serve --ensure` (what `/sessionscope` runs) also opens a browser tab. A foreground `serve` opens one only with `--open`. |
| `idleMinutes` | 30 | The background server (started by `--ensure`) stops after this many minutes without a request. `0` turns the stop off. A missing, negative or non-numeric value means 30. |

`setup` writes the file with only `port` and `openBrowser` when it does not exist; add `idleMinutes` yourself if you want to change it. If the file is not valid JSON, all defaults are used. `port` and `idleMinutes` apply when the server next starts (run `sessionscope serve --stop` first); `openBrowser` applies on the next `serve --ensure`.

## Prices

Every cost is `tokens x price`, in USD per million tokens, with separate prices for input, output, cache reads, 5-minute cache writes and 1-hour cache writes ([Costs](costs.md) has the formula). The built-in table covers these models, and a dated id such as `claude-haiku-4-5-20251001` matches its undated name:

| Models | Basis |
|---|---|
| Opus 5.5, Sonnet 5.5, Haiku 4.5 | `verified`: the rates reproduce Claude Code's own cost on real transcripts |
| Fable 5 and 5.1, Opus 5, 4.8, 4.7 and 4.6, Sonnet 5 and 4.6, Haiku 5.5 | `list`: published list prices only |

Any other model is **unpriced**: its cost is empty, never $0. It is left out of totals and flagged on every page. The `basis` label is yours to read, not a promise about your bill; see [Accuracy](accuracy.md).

### Adding or overriding a price

Create `~/.sessionscope/pricing.json` with only the models you want to add or change. Use the model id exactly as sessionscope shows it (the `models` column of `sessionscope report`, or the "Unpriced models" line of `sessionscope doctor`):

```json
{
  "models": {
    "claude-some-new-model": {
      "input": 3, "output": 15,
      "cacheRead": 0.3, "cacheWrite5m": 3.75, "cacheWrite1h": 6
    }
  }
}
```

| Field | Required | Meaning |
|---|---|---|
| `input`, `output`, `cacheRead`, `cacheWrite5m`, `cacheWrite1h` | Yes | Finite numbers, zero or more, USD per million tokens. |
| `basis` | No | `verified`, `list` or `derived`. Shown on the Health page. |
| `fastMultiplier` | No | A number above 0 that multiplies the cost of messages recorded in fast mode. |
| `longContext` | No | `{ "aboveTokens", "input", "output" }`: rates for requests whose prompt exceeds `aboveTokens`. Needs a non-zero `input`. |

A top-level `"webSearchPerRequest"` (default 0.01 USD per request) can also be set. An entry for a model already in the built-in table replaces it; the others are added. An invalid entry is ignored on its own, the rest still apply, and `sessionscope doctor` and the Health page list it ("Ignored entries in pricing.json"). A model with an ignored entry keeps its built-in price, or stays unpriced if it has none, until you fix the entry.

### How re-costing works

sessionscope stores a hash of the effective price table with every session. When the hash changes, each session is re-priced the next time it is recorded, with no flag needed. Recording happens:

- for the session a hook fires on, immediately;
- for every session, on `sessionscope record --all`, on the dashboard's Refresh button and on its 30-second rescan.

`sessionscope record --all --force` recomputes everything regardless. A running dashboard server loads the price table at start-up, so after editing `pricing.json` run `sessionscope serve --stop`, then open the dashboard again.

### Do the prices match Claude Code?

```bash
sessionscope doctor --verify-pricing
```

For every priced model you used, it compares your price table with the `cost-state` entries Claude Code wrote in your transcripts. Two tests run per (session, model) pair that has a Claude Code cost:

- **in-range:** Claude Code's own token counts, priced with your table, give a range (all cache writes at the 5-minute rate to all at the 1-hour rate, because Claude Code does not split them). Claude Code's cost must fall inside it, within $0.005. The columns show how many pairs passed (`in-range`) and the biggest miss (`max outside`).
- **exact:** where the token counts are identical, sessionscope's own cost, which knows the real 5-minute and 1-hour split, is compared with Claude Code's. The columns show how many pairs qualified (`exact-token pairs`) and the largest error.

Models with no Claude Code cost recorded show "no Claude Code cost recorded". The same table is on the [Health page](#/health). If a price disagrees, `doctor` also raises a warning naming the model.

### Suggested prices for unpriced models

When a model has no price, `sessionscope doctor` looks at Claude Code's own per-model cost for it and tries to work out the rates (a least-squares fit). Needs at least four sessions with a Claude Code cost for that model and enough variety in their token mixes; otherwise it says why it cannot. When it can, the output looks like this (the values here are placeholders):

```
Suggested price for claude-x, derived from Claude Code's own figures
    Fitted on 6 sessions; largest error $0.0012 (0.40%). ... add this under "models" in ~/.sessionscope/pricing.json: {"claude-x":{"input":3,"output":15,...,"basis":"derived"}}
```

It is only a suggestion: sessionscope prints it and never writes it. Claude Code does not split cache writes by time-to-live, so both write rates get one blended value; prefer the published price if you have it. A derived price is labelled `derived` on the Health page.

## Exports

```bash
sessionscope export --format csv --out sessions.csv
sessionscope export --messages --format json
```

Exports hold counts, costs, ids, model names, timestamps, session titles and working directories. They contain **no prompt, reply or tool text**, because none is ever stored ([Privacy](privacy.md)). Titles and directory paths can still say something about your work, so look before sharing a file.

**Session export** (default): one row per session, every session recorded, newest first. CSV columns:

| Group | Columns |
|---|---|
| Identity | `sessionId`, `source`, `project`, `cwd`, `title`, `label`, `entrypoint` |
| Time | `startedAt`, `endedAt`, `durationMs` |
| Counts | `turns`, `messages`, `sidechainMessages`, `partialMessages`, `switches`, `compactions` |
| Tokens | `inputTokens`, `outputTokens`, `cacheWriteTokens`, `cacheReadTokens`, `totalTokens` |
| Cost | `costUsd`, `unpricedTokens`, `costComplete`, `unpricedModels`, `claudeCodeCostUsd` |
| Other | `models`, `ccVersions`, `parserStatus` |

`costUsd` is **empty (null in JSON) when nothing in the session could be priced**, and `costComplete` is `false` whenever some tokens were left out of `costUsd`. List columns (`models`, `unpricedModels`, `ccVersions`) are space-separated in CSV. The JSON form is richer: `models` is a list of per-model totals, and `costState` carries Claude Code's own per-model figures instead of `claudeCodeCostUsd`.

**Message export** (`--messages`): one row per API message with `session_id`, `msg_id`, `ts`, `model`, `input`, `output`, `cache_write` (which includes `cache_write_1h`), `cache_write_1h`, `cache_read`, `web_search`, `speed`, `partial`, `cost_usd`, `priced`, `sidechain`, `agent_id`, `turn` and `seq`. `cost_usd` is empty or null for an unpriced model; `partial`, `priced` and `sidechain` are 0 or 1.

Export takes no filters. Without `--out` it prints to standard output.
