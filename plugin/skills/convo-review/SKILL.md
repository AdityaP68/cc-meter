---
name: convo-review
description: Review a session with agent-lens: /convo-review <session-id>
disable-model-invocation: true
allowed-tools: Bash(*/scripts/agent-lens.sh review *)
---
!`"${CLAUDE_PLUGIN_ROOT}"/scripts/agent-lens.sh review "$ARGUMENTS" --yes`

Reply with the output above exactly as written, and nothing else.
