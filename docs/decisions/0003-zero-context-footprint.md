# 0003 — Zero context footprint: hooks, not MCP; `/ccmeter` without a model call

**Status:** accepted 2026-10-14, amended 2026-10-15

**Context.** Measured with `claude plugin details`: hooks cost 0 tokens; a loaded skill ≈ 39 tokens per session
even with `disable-model-invocation: true`; a command ≈ 16. A slash command that runs the model re-reads the
whole conversation (priced by context size).

**Decision.** Recording via Stop/SessionEnd hooks; no MCP server. `/ccmeter` is a `UserPromptSubmit` hook returning
`{"continue":false,"stopReason":"ccmeter dashboard: <url>"}` (2026-10-15: replaces `decision:block`, which added an "Original prompt"
echo). The M3 skill ships as `SKILL.md.stub`. A small command file remains as a discoverable fallback (owner chose to keep it,
2026-10-15). Enforced by `scripts/harness/check.mjs` and `tests/plugin.test.ts`.
