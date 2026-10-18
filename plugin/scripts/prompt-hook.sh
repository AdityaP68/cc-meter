#!/bin/sh
# UserPromptSubmit hook: when the user types exactly "/agent-lens", start (or reuse) the local dashboard server and show
# its URL WITHOUT calling the model: {"continue":false,"stopReason":url} stops the turn before the model is called, so it
# costs no tokens. ("decision":"block" also works but adds an "Original prompt:" echo; stopReason prints just our line.)
# Every other prompt exits immediately (one grep) and is left untouched.
payload=$(cat)
if ! printf '%s' "$payload" | grep -Eq '"prompt"[[:space:]]*:[[:space:]]*"[[:space:]]*/agent-lens(:agent-lens)?[[:space:]]*"'; then
  exit 0
fi
here=$(dirname "$0")
url=$("$here/agent-lens.sh" serve --ensure --url-only 2>/dev/null)
[ -n "$url" ] || exit 0
printf '{"continue":false,"stopReason":"agent-lens dashboard: %s"}\n' "$url"
exit 0
