---
name: convo-review
description: Review a session with ccmeter: /convo-review <session-id>
disable-model-invocation: true
allowed-tools: Bash(*/scripts/ccmeter.sh review *)
---
!`"${CLAUDE_PLUGIN_ROOT}"/scripts/ccmeter.sh review "$ARGUMENTS" --yes`

Reply with the output above exactly as written, and nothing else.
