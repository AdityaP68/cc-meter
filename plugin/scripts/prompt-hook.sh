#!/bin/sh
# UserPromptSubmit hook: when the user types exactly "/ccmeter", start (or reuse) the local dashboard server and show
# its URL WITHOUT calling the model: the prompt is blocked, so it never reaches the conversation and costs no tokens.
# Every other prompt exits immediately (one grep) and is left untouched.
payload=$(cat)
if ! printf '%s' "$payload" | grep -Eq '"prompt"[[:space:]]*:[[:space:]]*"[[:space:]]*/ccmeter(:ccmeter)?[[:space:]]*"'; then
  exit 0
fi
here=$(dirname "$0")
url=$("$here/ccmeter.sh" serve --ensure --url-only 2>/dev/null)
[ -n "$url" ] || exit 0
printf '{"decision":"block","reason":"ccmeter dashboard: %s"}\n' "$url"
exit 0
