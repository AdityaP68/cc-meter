---
description: Open the agent-lens dashboard (prints its local URL)
disable-model-invocation: true
allowed-tools: Bash(*/scripts/agent-lens.sh serve --ensure --url-only)
---
!`"${CLAUDE_PLUGIN_ROOT}"/scripts/agent-lens.sh serve --ensure --url-only`

Reply with the line above exactly as written, and nothing else.
