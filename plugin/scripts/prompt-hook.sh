#!/bin/sh
# UserPromptSubmit hook: when the user types exactly "/ccmeter", start (or reuse) the local dashboard server and show
# its URL WITHOUT calling the model: {"continue":false,"stopReason":url} stops the turn before the model is called, so it
# costs no tokens. ("decision":"block" also works but adds an "Original prompt:" echo; stopReason prints just the URL.)
# Every other prompt exits immediately (one grep) and is left untouched.
payload=$(cat)
if ! printf '%s' "$payload" | grep -Eq '"prompt"[[:space:]]*:[[:space:]]*"[[:space:]]*/ccmeter(:ccmeter)?[[:space:]]*"'; then
  exit 0
fi
here=$(dirname "$0")
url=$("$here/ccmeter.sh" serve --ensure --url-only 2>/dev/null)
[ -n "$url" ] || exit 0
printf '{"continue":false,"stopReason":"%s"}\n' "$url"
exit 0
