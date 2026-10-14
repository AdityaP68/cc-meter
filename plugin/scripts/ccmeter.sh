#!/bin/sh
# Launcher used by the plugin's hooks and commands. Finds the ccmeter CLI without any absolute path in the repo:
#   1. `ccmeter` on PATH            (npm -g / npm link / npx-installed)
#   2. the path `ccmeter setup` wrote to ~/.ccmeter/cli-path   (git clone + ./install.sh)
# If neither exists it exits 0 silently: a missing recorder must never break a Claude Code session
# (`ccmeter doctor` reports it).
home="${CCMETER_HOME:-$HOME/.ccmeter}"
if command -v ccmeter >/dev/null 2>&1; then
  exec ccmeter "$@"
fi
if [ -r "$home/cli-path" ]; then
  target=$(cat "$home/cli-path")
  if [ -f "$target" ]; then
    exec node "$target" "$@"
  fi
fi
exit 0
