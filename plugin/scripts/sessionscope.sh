#!/bin/sh
# Launcher used by the plugin's hooks and commands. Finds the sessionscope CLI without any absolute path in the repo:
#   1. `sessionscope` on PATH            (npm -g / npm link / npx-installed)
#   2. the path `sessionscope setup` wrote to ~/.sessionscope/cli-path   (git clone + ./install.sh)
# If neither exists it exits 0 silently: a missing recorder must never break a Claude Code session
# (`sessionscope doctor` reports it).
# `record` is the hook path: its exit status and stderr are discarded so that a missing `node` (GUI-launched apps often
# lack nvm's PATH) or a Node too old for node:sqlite can never surface as a hook error. Other commands keep theirs.
# Same order as core/paths.ts: SESSIONSCOPE_HOME, the old CCMETER_HOME, ~/.sessionscope, ~/.ccmeter (until setup copies it).
home="${SESSIONSCOPE_HOME:-${CCMETER_HOME:-}}"
if [ -z "$home" ]; then
  home="$HOME/.sessionscope"
  [ -d "$home" ] || { [ -d "$HOME/.ccmeter" ] && home="$HOME/.ccmeter"; }
fi
if command -v sessionscope >/dev/null 2>&1; then
  [ "$1" = record ] && { sessionscope "$@" 2>/dev/null; exit 0; }
  exec sessionscope "$@"
fi
if [ -r "$home/cli-path" ] && command -v node >/dev/null 2>&1; then
  target=$(cat "$home/cli-path")
  if [ -f "$target" ]; then
    [ "$1" = record ] && { node "$target" "$@" 2>/dev/null; exit 0; }
    exec node "$target" "$@"
  fi
fi
exit 0
