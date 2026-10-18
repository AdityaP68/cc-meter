# 0011 — Rename sessionscope to agent-lens

**Status:** accepted 2026-10-19 (owner). Supersedes the name in [0010](0010-rename-to-sessionscope.md).

**Context.** "sessionscope" said nothing about the product; the owner chose **agent-lens**: it names what the tool is (a lens on
coding agents' usage, cost, accuracy and prompt quality) and is agent-neutral (Claude Code now, Copilot and others later).
npm on 2026-10-19: `agent-lens` free; `agentlens` and `agentledger` taken (the latter is a live agent-observability package,
so avoided). PyPI, crates.io and trademark not checked.

**Decision.** Everything user-visible is `agent-lens`: package and bin, CLI, plugin `agent-lens@agent-lens` and `/agent-lens`,
`~/.agent-lens`, `agent-lens.db`, `AGENT_LENS_HOME`, `AGENT_LENS_JUDGE_RUNNING`, header `x-agent-lens`, source tag
`agent-lens-judge`, `*.agent-lens-backup`. Reconcile rows name the transcript side `ours` (was the tool's name).
- **Two earlier names are read as fallbacks, newest first** (ccmeter, then sessionscope): env vars `SESSIONSCOPE_HOME`,
  `CCMETER_HOME` and the `*_JUDGE_RUNNING` variants; folders `~/.sessionscope`, `~/.ccmeter`; files `sessionscope.db`,
  `ccmeter.db`; stored tags `sessionscope-judge`, `ccmeter-judge`.
- **Migration:** `agent-lens setup` copies the newest earlier folder to `~/.agent-lens` once (never deletes or edits the old
  one), replaces the plugins `sessionscope@sessionscope` / `ccmeter@ccmeter` and a status line under either old command;
  `doctor` warns while an old plugin is installed.
- **Immutable:** migration v1 and `core/migrations.lock.json` untouched.

**Consequences.** Dashboard saved filters reset once (localStorage key). The GitHub repo and local directory are renamed by the owner.
