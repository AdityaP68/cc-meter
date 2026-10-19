# Troubleshooting

Start with `ccmeter doctor` (or the [Health page](#/health), which shows the same checks). Most problems show up there with a hint. The first table maps symptoms you can see to a fix; the second explains each doctor check.

## Symptoms

| Symptom | Cause | Fix |
|---|---|---|
| `ccmeter: command not found` | The CLI is not on your PATH. The hooks do not need it, but your shell does. | Run `npm link` in the clone, or call `node <clone>/dist/cli/index.js`. |
| `doctor` says "Recorder hooks not found" | The plugin is not installed, or `claude` was not on PATH when you ran setup. | Run `./install.sh` again, check `claude plugin list`, then restart Claude Code or run `/reload-plugins`. |
| A recent session is missing | It is recorded when a turn or the session ends. The hook may not have run, or the transcript has no real API call (these are skipped). | Run `ccmeter record --all`, or open the dashboard (it rescans every 30 seconds) and press Refresh. `doctor` shows "n transcripts are not recorded" when it finds some. |
| Sessions from the Claude desktop app are not recorded, others are | Hooks run with the PATH of the app, which can lack `node` when Node comes from a version manager. | Run `ccmeter record --all` regularly, or make `node` available on a standard PATH. `doctor` reports unrecorded transcripts. **Unverified** on your setup. |
| "Unpriced" banner, `+ unpriced` chips, or `$x+unpriced` in reports | A model is not in the price table. | Add it to `~/.ccmeter/pricing.json`; `doctor` prints a suggested price when it can. See [Configuration and pricing](config-and-pricing.md). |
| Costs did not change after editing `pricing.json` | A running dashboard server loads prices at start-up; sessions are re-priced when recorded. | `ccmeter serve --stop`, then `ccmeter record --all`, then open the dashboard again. |
| My numbers differ from Claude Code's | Expected in some sessions: Claude Code can bill calls it never writes to the transcript, and its record can cover less of a long session. | Open the session page and read the comparison table; see [Accuracy](accuracy.md). Neither number is hidden. |
| The dashboard says "Dashboard not built" (HTTP 503) | `dashboard/dist/` is missing in the clone. | Run `./install.sh` again, which builds it. |
| The page does not load, or shows "forbidden host" | The server only answers `127.0.0.1`, `localhost` or `[::1]` on its own port. A proxy or another hostname is rejected. | Use the address printed by `ccmeter serve --url-only` exactly. |
| Port busy | Another program uses 7337. | ccmeter picks the next free port by itself. To choose one, set `port` in `config.json` or run `ccmeter serve --port 7400`. |
| The server is stuck or the address in `server.json` is stale | A background server crashed or was killed. | `ccmeter serve --stop`, then `ccmeter serve --ensure`. |
| `/ccmeter` does nothing, or Claude answers instead of showing an address | The plugin is not loaded in this session, or the hook could not start the server. | Run `/reload-plugins` or restart Claude Code, check `claude plugin list`, then try `ccmeter serve --open`. |
| `/ccmeter` shows "Operation stopped by hook: ccmeter dashboard: http://..." | This is the working message; the prefix is Claude Code's wording in a headless run (interactive rendering is **unverified**). | Open the address. See [Status line and /ccmeter](statusline-and-command.md). |
| The status line shows nothing, or `$–` and `– tok` | `ccmeter` is not on the PATH Claude Code uses, or the payload had no transcript path. | Run `npm link`; check the `statusLine` entry in `~/.claude/settings.json`. The live payload is **unverified**. |
| `setup --statusline` says a statusLine is already configured | You have one; ccmeter never replaces it. | Edit `~/.claude/settings.json` yourself, or restore the backup (`settings.json.ccmeter-backup`). |
| Claude Code updated and `doctor` warns | The release is newer than the verified range (2.1.236 to 2.1.295). | Recording continues. Look at "Unrecognized" lines in `doctor`; if there are none, the format is unchanged. See [Accuracy](accuracy.md). |
| The dashboard behaves like the old version after an upgrade | A server started before the update is still running the old code. The server sends no-store headers, so the browser cache is not the cause. | `ccmeter serve --stop`, then `/ccmeter` or `ccmeter serve --open`. |
| Start over | You want a clean database. | `ccmeter serve --stop`, delete `~/.ccmeter/ccmeter.db*`, then `ccmeter record --all`. Your `config.json` and `pricing.json` are kept. If the folder also holds an old `ccmeter.db`, delete that too, or ccmeter falls back to it. |
| A session with only an unpriced model shows `$0.000+unpriced` (CLI) or `$0` with a `+ unpriced` chip (dashboard) | The cost field is zero because nothing could be priced. The marker is the signal: read it as "unknown", not free. `export` shows it correctly as an empty cost with `costComplete` false. | Add the model's price ([Configuration and pricing](config-and-pricing.md)). |
| `report --by <something>` prints the session list | Only `day`, `project` and `model` are valid; any other value (or none) silently falls back to the session list. | Use one of the three. |
| `serve --url-only word` loses `word`, or `--json=false` still prints JSON | `--url-only` is not registered as a switch, so a bare word after it is taken as its value; any non-empty `--json` value turns JSON on. | Put `--url-only` last or before another flag; omit `--json` to turn it off. |
| `serve --ensure --port 7400` ignores the port | A server is already running and is reused. | `ccmeter serve --stop`, then start again with the port. |

To see what the hooks are doing, read `~/.ccmeter/record.log`: one line per call with the event, session id, result (`recorded`, `unchanged`, ...) and time. It never contains conversation text.

## Doctor checks

Each check has an id and a level, shown by `ccmeter doctor --json` as `ok`, `info`, `warn` or `error`. Errors make `doctor` exit with code 2.

| Check id | Reports | What to do |
|---|---|---|
| `node` | Node version; error if older than 22.13. | Install Node 22.13 or newer. |
| `db` | Database integrity and schema version; error if damaged or unreadable. | Start over (above). If the schema version differs from the CLI's, update the clone and run `./install.sh`. |
| `cc-version` | The installed Claude Code against the verified range; warns if `claude` is missing, newer, older, or has no matching parser. | Newer: nothing needed, recording continues. Missing: put `claude` on PATH. |
| `parser-status` | A warning (`warn`) when some recorded sessions came from a Claude Code version outside the verified range. | Recording was not blocked; the Accuracy report on Health counts them. See [Accuracy](accuracy.md). |
| `unknown-types` | Transcript entry types ccmeter does not know (skipped, not fatal). | If listed, the format may have changed; numbers might be incomplete. |
| `unknown-usage` | Unrecognized token fields: a new billable token class may be uncounted. | Treat costs as a lower bound until ccmeter is updated for that Claude Code version. |
| `unparsable` | Transcript lines that were not valid JSON. | Usually harmless; recorded sessions skip those lines. |
| `no-usage` | Assistant entries without a usage object. | Informational. |
| `partial-usage` | Sessions with replies saved mid-stream (output tokens are a lower bound). | Informational; the session page shows the `≥ lower bound` note. |
| `unpriced` | Models without a price, with Claude Code's own figure for them. | Add a price to `pricing.json`. |
| `derived-price:<model>` | A suggested price for an unpriced model, or why none can be derived. | Paste the snippet into `pricing.json` if you accept it. |
| `price-basis` | Prices not marked `verified`; a warning if Claude Code's own cost disagrees with the table. | Run `ccmeter doctor --verify-pricing`; override the price if it is wrong. |
| `pricing-override` | Entries in your `pricing.json` that were ignored. | Fix them: each needs finite, non-negative numbers for all five rates. |
| `pricing` | The price table version and hash, and which files contributed. | Informational. |
| `hooks` | Whether the plugin (or a `ccmeter record` hook in `settings.json`) is installed. | Run `./install.sh`. |
| `legacy-plugin` | A plugin under an earlier name (`agent-lens@agent-lens`, `sessionscope@sessionscope`) is still installed, so hooks would run twice. | Run `ccmeter setup`, or `claude plugin uninstall agent-lens@agent-lens`. |
| `cli-path` | The file the hooks launch; an error if it no longer exists (you moved or deleted the clone), info if there is no `cli-path`. | Run `./install.sh` from the clone's current location. |
| `coverage` | Transcripts not yet recorded or out of date, and ones with no API calls. | Run `ccmeter record --all`. |
| `reconcile` | How many (session, model) pairs match Claude Code's own totals. | Informational; see [Accuracy](accuracy.md). |

Not every check appears every time; for example `unparsable` and `no-usage` are only shown when they apply.
