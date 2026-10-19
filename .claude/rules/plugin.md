---
paths:
  - "plugin/**"
  - ".claude-plugin/**"
  - "install.sh"
  - "cli/commands/setup.ts"
  - "cli/commands/record.ts"
  - "cli/commands/statusline.ts"
---
# Plugin, install and hooks

- LIVE: the user's Claude Code loads `plugin/` from this checkout in place and its hooks run `dist/`. An edit here
  takes effect at their next session. Verify (`npm run verify -- --full`) before building.
- Zero context footprint (decision 0003): the only loadable skill is `convo-review`, a thin wrapper for `ccmeter review`
  (`check.mjs` enforces it; about 20 tokens always-on); measure any new component with `claude plugin details ccmeter` in an
  isolated `CLAUDE_CONFIG_DIR`.
- Hook scripts print nothing (except the `/ccmeter` stop reason) and always exit 0. No absolute paths; find the CLI
  via PATH or `~/.ccmeter/cli-path`.
- Test install/setup only with isolated `CLAUDE_CONFIG_DIR` and `CCMETER_HOME`. For live `claude -p` experiments,
  disable the installed plugin: `--settings '{"enabledPlugins":{"ccmeter@ccmeter":false}}'`.
- `claude plugin marketplace add` needs an absolute path or `./path` (not `.`). Validate: `claude plugin validate .`.
- Never edit the user's `~/.claude/settings.json` without asking; `ccmeter setup --statusline` backs it up first.
