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
- Zero context footprint (decision 0003): the only loadable skill is `convo-review`, a thin wrapper for `agent-lens review`
  (`check.mjs` enforces it; about 20 tokens always-on); measure any new component with `claude plugin details agent-lens` in an
  isolated `CLAUDE_CONFIG_DIR`.
- Hook scripts print nothing (except the `/agent-lens` stop reason) and always exit 0. No absolute paths; find the CLI
  via PATH or `~/.agent-lens/cli-path`.
- Test install/setup only with isolated `CLAUDE_CONFIG_DIR` and `AGENT_LENS_HOME`. For live `claude -p` experiments,
  disable the installed plugin: `--settings '{"enabledPlugins":{"agent-lens@agent-lens":false}}'`.
- `claude plugin marketplace add` needs an absolute path or `./path` (not `.`). Validate: `claude plugin validate .`.
- Never edit the user's `~/.claude/settings.json` without asking; `agent-lens setup --statusline` backs it up first.
