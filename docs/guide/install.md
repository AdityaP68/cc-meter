# Install

sessionscope installs from a git clone: one script builds it, registers it as a local Claude Code plugin, creates its data folder and records your existing sessions. There is no package-registry install today.

## Requirements

| Need | Why | Check |
|---|---|---|
| Node.js 22.13 or newer | sessionscope uses the built-in `node:sqlite`; it has no runtime dependencies | `node --version` |
| npm and git | to clone and build (build tools only) | `npm --version` |
| `claude` on your PATH | to register the plugin; without it setup skips that step and says so | `claude --version` |

Supported platforms:

- **macOS** is what sessionscope was built and tested on.
- **Linux** is **unverified**. Nothing in the code is macOS-only (the browser opener falls back to `xdg-open`), but it has not been run there.
- **Windows** is **unverified** and likely to fail: the plugin's hook scripts are POSIX `sh`.

Claude Code is the only data source. It works with the terminal CLI, the Claude desktop app's Code tab and headless `claude -p` runs, because all of them write the same transcripts. Transcript formats are verified for Claude Code 2.1.236 to 2.1.295; a newer release makes `sessionscope doctor` warn, and recording continues (see [Accuracy](accuracy.md)).

## Install

```bash
git clone <repo-url> sessionscope
cd sessionscope
./install.sh
```

`install.sh` is a short shell script. In order, it:

1. Checks that `node` and `npm` exist and that Node is 22.13 or newer; otherwise it exits with a message.
2. Runs `npm ci` to install the build tools (TypeScript, Vite, React for the dashboard). This is the only step that touches the network, and it is npm, not sessionscope.
3. Runs `npm run build`: the CLI goes to `dist/`, the dashboard to `dashboard/dist/`.
4. Marks `dist/cli/index.js` and `plugin/scripts/sessionscope.sh` executable.
5. Runs `sessionscope setup` (below).
6. Runs `sessionscope doctor`. A failing check does not abort the install.
7. Prints a reminder about `npm link`.

`sessionscope setup` does the following, in this order:

- Copies an old `~/.ccmeter` folder to `~/.sessionscope` once, if you have one (see "Upgrading from ccmeter").
- Creates `~/.sessionscope`, writes `cli-path` (where the hooks find the CLI) and a default `config.json` if there is none.
- If `claude` is on PATH, registers the clone as a local plugin marketplace named `sessionscope` and installs the plugin `sessionscope@sessionscope` (hooks: `Stop`, `SessionEnd`, and `UserPromptSubmit` for `/sessionscope`).
- Records every transcript under `~/.claude/projects` (the backfill) and prints how many sessions it recorded.

Extra arguments are passed to `setup`, so `./install.sh --no-backfill` skips the backfill and `./install.sh --statusline` also configures the [status line](statusline-and-command.md).

The plugin loads **in place** from your clone. Do not delete or move the clone; if you do, run `./install.sh` again from the new location.

## After installing

1. Restart any running Claude Code session once, or run `/reload-plugins`, so it loads the plugin.
2. Optional: run `npm link` in the clone. It puts `sessionscope` on your PATH so you can type `sessionscope report` in any shell. The hooks work without it (they use the path in `~/.sessionscope/cli-path`), but the **status line command needs it**, because Claude Code runs `sessionscope statusline` through the PATH.
3. Continue with [First steps](first-steps.md).

## Try it without touching your own setup

An isolated install uses a throwaway Claude config and data folder, so nothing in `~/.claude` or `~/.sessionscope` changes:

```bash
T=$(mktemp -d)
git clone <repo-url> $T/sessionscope
cd $T/sessionscope
CLAUDE_CONFIG_DIR=$T/claude SESSIONSCOPE_HOME=$T/home ./install.sh
```

Measured on 2026-10-14 (before the rename, same steps): clone, `npm ci`, build, plugin install in an isolated Claude config, backfill and doctor took 5 seconds with a warm npm cache. A cold cache adds the download of the dev packages.

The sandbox has no transcripts, so it records 0 sessions. Use it to check that the install works, not to look at numbers. To run the CLI against it:

```bash
CLAUDE_CONFIG_DIR=$T/claude SESSIONSCOPE_HOME=$T/home node $T/sessionscope/dist/cli/index.js doctor
```

Delete `$T` when you are done. Because `SESSIONSCOPE_HOME` is set, setup also skips the `~/.ccmeter` migration.

## Updating

```bash
git pull
./install.sh
```

Re-running is safe: plugin registration is idempotent, an existing `config.json` is kept and the backfill skips unchanged transcripts. Because the plugin and the hooks run from the clone, the new version is live at the next Claude Code session.

## Upgrading from ccmeter

sessionscope was called **ccmeter** until 2026-10-19 (decision record 0010). Nothing breaks until you update; then:

| Old | What happens |
|---|---|
| `~/.ccmeter` folder | `sessionscope setup` copies it to `~/.sessionscope` once (the database is renamed `ccmeter.db` to `sessionscope.db`). Only files are copied; `server.json` and `cache/` are left out. The old folder is never edited or deleted: delete it yourself when you are satisfied. |
| `CCMETER_HOME` variable | Still read, after `SESSIONSCOPE_HOME`. Setup does not migrate when either variable is set. |
| Before you run setup | sessionscope reads `~/.ccmeter` as long as `~/.sessionscope` does not exist. |
| Plugin `ccmeter@ccmeter` | Setup uninstalls it and removes the `ccmeter` marketplace, so the hooks do not run twice. Until then `sessionscope doctor` warns. |
| Status line `ccmeter statusline` | Setup replaces it with `sessionscope statusline` without being asked, after saving `settings.json.sessionscope-backup`. |
| `ccmeter` command from `npm link` | Still points at the clone but is no longer documented. Remove it with `npm unlink -g ccmeter`. |
| Dashboard filters and theme | Reset once (the browser storage key changed). |

To upgrade, update the clone and run `./install.sh`.

## Uninstall

1. Stop the dashboard server: `sessionscope serve --stop`.
2. Remove the plugin: `sessionscope setup --uninstall`. It runs `claude plugin uninstall` and `claude plugin marketplace remove` for `sessionscope` and for the old `ccmeter` names. It prints "Plugin removed" even if a step failed, so confirm with `claude plugin list`.
3. If you enabled the status line, remove the `statusLine` entry from `~/.claude/settings.json`, or restore `~/.claude/settings.json.sessionscope-backup`. Uninstall does not touch that file.
4. If you ran `npm link`, run `npm unlink -g sessionscope`.
5. Delete your data if you want it gone: remove `~/.sessionscope`. This does not touch your Claude Code transcripts, and `sessionscope record --all` can rebuild the database from them.

See also [Troubleshooting](troubleshooting.md) and [Configuration and pricing](config-and-pricing.md).
