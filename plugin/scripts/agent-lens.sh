#!/bin/sh
# Launcher used by the plugin's hooks and commands. Finds the agent-lens CLI without any absolute path in the repo:
#   1. `agent-lens` on PATH            (npm -g / npm link / npx-installed)
#   2. the path `agent-lens setup` wrote to ~/.agent-lens/cli-path   (git clone + ./install.sh)
# If neither exists it exits 0 silently: a missing recorder must never break a Claude Code session
# (`agent-lens doctor` reports it).
# `record` is the hook path: its exit status and stderr are discarded so that a missing `node` (GUI-launched apps often
# lack nvm's PATH) or a Node too old for node:sqlite can never surface as a hook error. Other commands keep theirs.
# Same order as core/paths.ts: AGENT_LENS_HOME, then the env vars of earlier names, ~/.agent-lens, ~/.sessionscope, ~/.ccmeter.
home="${AGENT_LENS_HOME:-${SESSIONSCOPE_HOME:-${CCMETER_HOME:-}}}"
if [ -z "$home" ]; then
  home="$HOME/.agent-lens"
  if [ ! -d "$home" ]; then
    for old in "$HOME/.sessionscope" "$HOME/.ccmeter"; do [ -d "$old" ] && { home="$old"; break; }; done
  fi
fi
if command -v agent-lens >/dev/null 2>&1; then
  [ "$1" = record ] && { agent-lens "$@" 2>/dev/null; exit 0; }
  exec agent-lens "$@"
fi
if [ -r "$home/cli-path" ] && command -v node >/dev/null 2>&1; then
  target=$(cat "$home/cli-path")
  if [ -f "$target" ]; then
    [ "$1" = record ] && { node "$target" "$@" 2>/dev/null; exit 0; }
    exec node "$target" "$@"
  fi
fi
exit 0
