# Install

ccmeter installs from a git clone: one script builds it, registers it as a local Claude Code plugin, creates its data folder and records your existing sessions. There is no package-registry install today.

## Requirements

| Need | Why | Check |
|---|---|---|
| Node.js 22.13 or newer | ccmeter uses the built-in `node:sqlite`; it has no runtime dependencies | `node --version` |
| npm and git | to clone and build (build tools only) | `npm --version` |
| `claude` on your PATH | to register the plugin; without it setup skips that step and says so | `claude --version` |

Supported platforms:

- **macOS** is what ccmeter was built and tested on.
- **Linux** is **unverified**. Nothing in the code is macOS-only (the browser opener falls back to `xdg-open`), but it has not been run there.
- **Windows** is **unverified** and likely to fail: the plugin's hook scripts are POSIX `sh`.

Claude Code is the only data source. ccmeter reads the transcripts Claude Code writes. Sessions started from the terminal (`cli`), the Claude desktop app (`claude-desktop`) and headless `claude -p` runs (`sdk-cli`) have all been seen and parsed (`docs/FORMATS.md`, survey of 2026-10-14). Whether the plugin's hooks run inside the desktop app is **unverified**; `ccmeter record --all` picks those sessions up from their transcripts either way. Transcript formats are verified for Claude Code 2.1.236 to 2.1.295; a newer release makes `ccmeter doctor` warn, and recording continues (see [Accuracy](accuracy.md)).

## Install

```bash
git clone <repo-url> ccmeter
cd ccmeter
./install.sh
```

`install.sh` is a short shell script. In order, it:

1. Checks that `node` and `npm` exist and that Node is 22.13 or newer; otherwise it exits with a message.
2. Runs `npm ci` to install the build tools (TypeScript, Vite, React for the dashboard). This is the only step that touches the network, and it is npm, not ccmeter.
3. Runs `npm run build`: the CLI goes to `dist/`, the dashboard to `dashboard/dist/`.
4. Marks `dist/cli/index.js` and `plugin/scripts/ccmeter.sh` executable.
5. Runs `ccmeter setup` (below).
6. Runs `ccmeter doctor`. A failing check does not abort the install.
7. Prints a reminder about `npm link`.

`ccmeter setup` does the following, in this order:

- Copies an older `~/.agent-lens` (or `~/.sessionscope`) folder to `~/.ccmeter` once, if you have one and no `~/.ccmeter` yet (see "Upgrading from an earlier name").
- Creates `~/.ccmeter`, writes `cli-path` (where the hooks find the CLI) and a default `config.json` if there is none.
- If `claude` is on PATH, registers the clone as a local plugin marketplace named `ccmeter` and installs the plugin `ccmeter@ccmeter` (hooks: `Stop`, `SessionEnd`, and `UserPromptSubmit` for `/ccmeter`).
- Records every transcript under `~/.claude/projects` (the backfill) and prints how many sessions it recorded.

Extra arguments are passed to `setup`, so `./install.sh --no-backfill` skips the backfill and `./install.sh --statusline` also configures the [status line](statusline-and-command.md).

The plugin loads **in place** from your clone. Do not delete or move the clone; if you do, run `./install.sh` again from the new location.

## After installing

1. Restart any running Claude Code session once, or run `/reload-plugins`, so it loads the plugin.
2. Optional: run `npm link` in the clone. It puts `ccmeter` on your PATH so you can type `ccmeter report` in any shell. The hooks work without it (they use the path in `~/.ccmeter/cli-path`), but the status line entry is the bare command `ccmeter statusline`, so it needs `ccmeter` to be findable by Claude Code (see [Status line and /ccmeter](statusline-and-command.md)).
3. Continue with [First steps](first-steps.md).

## Try it without touching your own setup

An isolated install uses a throwaway Claude config and data folder, so nothing in `~/.claude` or `~/.ccmeter` changes:

```bash
T=$(mktemp -d)
git clone <repo-url> $T/ccmeter
cd $T/ccmeter
CLAUDE_CONFIG_DIR=$T/claude CCMETER_HOME=$T/home ./install.sh
```

Measured once, before the rename and with the same steps (the date is not recorded in `docs/ACCEPTANCE.md`): clone, `npm ci`, build, plugin install in an isolated Claude config, backfill and doctor took 5 seconds with a warm npm cache. A cold cache adds the download of the dev packages.

The sandbox has no transcripts, so it records 0 sessions. Use it to check that the install works, not to look at numbers. To run the CLI against it:

```bash
CLAUDE_CONFIG_DIR=$T/claude CCMETER_HOME=$T/home node $T/ccmeter/dist/cli/index.js doctor
```

Delete `$T` when you are done. Because `CCMETER_HOME` is set, setup also skips the `~/.ccmeter` migration.

## Updating

```bash
git pull
./install.sh
ccmeter serve --stop
```

The last command matters: a dashboard server started before the update keeps running the old code until it idles out (30 minutes without a request) or is stopped. The next `/ccmeter` or `ccmeter serve --open` starts a fresh one.

Re-running is safe: plugin registration is idempotent, an existing `config.json` is kept and the backfill skips unchanged transcripts. Because the plugin and the hooks run from the clone, the new version is live at the next Claude Code session.

## Upgrading from an earlier name

This tool was called **sessionscope** and then **agent-lens** on 2026-10-19 (decision records 0010, 0011) and is named **ccmeter** again (record 0012). Nothing breaks until you update; then:

| Old | What happens |
|---|---|
| `~/.agent-lens` or `~/.sessionscope` folder | `ccmeter setup` copies the newest one to `~/.ccmeter` once (the database is renamed to `ccmeter.db`). Only files are copied; `server.json` and `cache/` are left out. The old folder is never edited or deleted: delete it yourself when you are satisfied. If a `~/.ccmeter` from before the first rename still exists, move it aside first (`mv ~/.ccmeter ~/.ccmeter.old`), or setup will not copy. |
| `AGENT_LENS_HOME`, `SESSIONSCOPE_HOME` variables | Still read, after `CCMETER_HOME`. Setup does not migrate when any of them is set. |
| Before you run setup | ccmeter reads the newest older folder as long as `~/.ccmeter` does not exist. |
| Plugin `agent-lens@agent-lens` or `sessionscope@sessionscope` | Setup uninstalls it and removes its marketplace, so the hooks do not run twice. Until then `ccmeter doctor` warns. |
| Status line `agent-lens statusline` or `sessionscope statusline` | Setup replaces it with `ccmeter statusline` without being asked, after saving `settings.json.ccmeter-backup`. |
| `agent-lens` command from `npm link` | Still points at the clone but is no longer documented. Remove it with `npm unlink -g agent-lens`, then `npm link` for `ccmeter`. |
| Dashboard filters and theme | Reset once (the browser storage key changed). |

To upgrade, update the clone and run `./install.sh`.

## Uninstall

1. Stop the dashboard server: `ccmeter serve --stop`.
2. Remove the plugin: `ccmeter setup --uninstall`. It runs `claude plugin uninstall` and `claude plugin marketplace remove` for `ccmeter` and for the old `ccmeter` names. It prints "Plugin removed" even if a step failed, so confirm with `claude plugin list`.
3. If you enabled the status line, remove the `statusLine` entry from `~/.claude/settings.json`. Uninstall leaves that entry in place. (`claude plugin uninstall` itself does edit `settings.json`: it removes the plugin from `enabledPlugins`.) Removing the entry is safer than restoring `settings.json.ccmeter-backup`, which would also undo other changes made since.
4. If you ran `npm link`, run `npm unlink -g ccmeter`.
5. Delete your data if you want it gone: remove `~/.ccmeter`. This does not touch your Claude Code transcripts, and `ccmeter record --all` can rebuild the database from them.

See also [Troubleshooting](troubleshooting.md) and [Configuration and pricing](config-and-pricing.md).
