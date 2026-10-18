# Status line and /sessionscope

Two pieces put sessionscope inside Claude Code without costing any model tokens: an optional **status line** that shows the current session's cost, and the **`/sessionscope`** command that opens the dashboard. Both run as separate processes. There is no MCP server, and nothing here adds text to your conversation.

## The status line

The status line is the strip Claude Code draws under the prompt. sessionscope can fill it with:

```
Sonnet 5.5 | $0.034 | 32.0k tok
```

That is `model | session cost | session tokens`. The model is the one Claude Code reports; the cost and tokens are for the whole current session, subagents included, computed the same way as in the dashboard.

### Turn it on

```bash
sessionscope setup --statusline
```

This adds the following entry to `~/.claude/settings.json`, after copying the file to `~/.claude/settings.json.sessionscope-backup`:

```json
{ "statusLine": { "type": "command", "command": "sessionscope statusline" } }
```

Rules it follows:

- If a `statusLine` is already configured, it leaves it unchanged and says so. Remove yours first if you want to switch.
- If `settings.json` exists but is not a valid JSON object, it writes nothing and exits 1, so your settings are never replaced.
- A status line that still runs the pre-rename `ccmeter statusline` command is updated automatically, with a backup.

The entry is the bare command `sessionscope statusline`, so `sessionscope` has to be findable by Claude Code: run `npm link` in the clone ([Install](install.md)). If you prefer not to link, you can put the full command in `settings.json` yourself, for example `node <clone>/dist/cli/index.js statusline`.

> **Unverified:** how Claude Code resolves a status line command (which PATH it uses, whether it runs through a shell) was not observed, because the status line only runs interactively. The advice to link is the safe reading of the entry above, and the full-path form has not been tried inside Claude Code.

To turn it off, delete the `statusLine` entry from `~/.claude/settings.json` or restore the backup file.

### What it prints

| Part | Example | Meaning |
|---|---|---|
| Model | `Sonnet 5.5` | The model's display name from Claude Code, else its id, else `Claude`. |
| Cost | `$0.034` | sessionscope's estimate for this session at list price. `$–` when it cannot be computed. |
| Tokens | `32.0k tok` | Input, output and cache tokens for the session. `– tok` when unknown. |
| Unpriced cost | `$0.034+?` | Some tokens belong to a model with no price; they are not in the cost. |
| Unpriced model | `⚠ unpriced: claude-x` | Appended when the session used a model with no price. Fix it in [Configuration and pricing](config-and-pricing.md). |

Reading the unpriced marker: a session that used only an unpriced model prints `$0.000+?`. That is "unknown", not "free"; the `+?` and the warning part say so.

### How it works

Claude Code sends a JSON object on standard input each time it redraws the status line. sessionscope uses these fields: the model (`model.display_name` or `model.id`) and `transcript_path`. According to Claude Code's documentation (`docs/FORMATS.md` section 2), the payload's own token counts describe only the current context window, not the session total, and its cost (`cost.total_cost_usd`) resets on `/clear`; so sessionscope reads the session's transcript instead. Claude Code's cost figure is used only as a fallback when the transcript cannot be read.

Parsing a large transcript on every redraw would be slow, so the result is cached in `~/.sessionscope/cache/statusline-<session id>.json`. The cache is keyed to the transcript's size and modification time and to the price table; it recalculates when either changes. The cache files hold a cost, a token count and model names. They are safe to delete.

The command never prints to standard error and always exits 0, so a problem cannot disturb your session. The figures come from the transcript, so they are as current as the transcript is whenever Claude Code runs the command. How often it runs was not observed.

> **Unverified:** the status line payload is described in Claude Code's documentation (read 2026-10-14) but has **not been captured from a live interactive session**, because the status line only runs interactively. Field names above come from that documentation and from tests with sample payloads.

## The /sessionscope command

Type `/sessionscope` and press Enter. Claude Code shows one line with the dashboard address:

```
Operation stopped by hook: sessionscope dashboard: http://127.0.0.1:7337/
```

Open that address in a browser. The hook returns only `sessionscope dashboard: <url>`. The prefix "Operation stopped by hook:" is what Claude Code showed in a headless run; sessionscope does not control it. The port is 7337 unless `config.json` says otherwise or that port was busy.

### Why it costs no tokens

`/sessionscope` is not a normal slash command. A `UserPromptSubmit` hook looks at what you typed. If it is exactly `/sessionscope` (or `/sessionscope:sessionscope`), the hook starts the dashboard server if needed (`sessionscope serve --ensure --url-only`) and tells Claude Code to stop the turn (`{"continue":false,"stopReason":...}`) and show the line. The design is that the prompt never reaches the model, so nothing is added to the conversation and nothing is billed. Every other prompt is checked with a single pattern match and passed through untouched. The hook has a 10-second timeout.

> **Unverified:** that a stopped prompt makes no model call, and the "Operation stopped by hook:" prefix, were observed once in a headless Claude Code run and are recorded in `docs/ARCHITECTURE.md` and decision record 0003. The Claude Code version of that run is not recorded and `docs/FORMATS.md` has no entry for it.

The server it starts runs detached and stops itself after 30 minutes without a request (`idleMinutes` in [Configuration and pricing](config-and-pricing.md)).

### The fallback command

The plugin also ships a command file, `/sessionscope:sessionscope`, so the command shows up in Claude Code's command list. It is marked `disable-model-invocation: true` and costs about 16 tokens of listing per session (measured with `claude plugin details`, see decision record 0003). The hook intercepts the same text first, so you normally never run the file itself. If the hook cannot produce an address (for example the server failed to start), it exits silently and the prompt continues; whether Claude Code then runs the command file, and so makes one model call, has not been observed.

> **Unverified:** the one-line message was checked by running Claude Code headlessly. How an interactive session renders it has not been reported back yet. Before 2026-10-15 the hook used a different mechanism (`decision: block`) that added an "Original prompt" echo (decision record 0003). If you still see that echo, the plugin loaded in that session may be older; `/reload-plugins` or a restart may help (a guess, not observed).

### If nothing appears

Check, in this order: the plugin is installed (`claude plugin list`), you restarted Claude Code or ran `/reload-plugins` after installing, and `sessionscope doctor` shows the hooks line as OK. More in [Troubleshooting](troubleshooting.md). You can always open the dashboard from a shell with `sessionscope serve --open`.
