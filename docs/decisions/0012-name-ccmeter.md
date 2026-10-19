# 0012 — The name is ccmeter

**Status:** accepted 2026-10-19 (owner). Supersedes the name in [0011](0011-rename-to-agent-lens.md) (and 0010).

**Context.** The owner reverted to the first name after trying sessionscope and agent-lens within one day: the project is
**ccmeter**. (Why 0010 left it: the name tied the tool to one agent and to cost; kept anyway, by the owner's call.)

**Decision.** Everything user-visible is `ccmeter`: package and bin, CLI, plugin `ccmeter@ccmeter` and `/ccmeter`, `~/.ccmeter`,
`ccmeter.db`, `CCMETER_HOME`, `CCMETER_JUDGE_RUNNING`, header `x-ccmeter`, source tag `ccmeter-judge`, judge folder `ccmeter-judge`,
`*.ccmeter-backup`.
- **Two earlier names are read as fallbacks, newest first:** agent-lens, then sessionscope (env vars `AGENT_LENS_HOME`,
  `SESSIONSCOPE_HOME`, `*_JUDGE_RUNNING`; folders; `agent-lens.db`, `sessionscope.db`; stored tags `agent-lens-judge`,
  `sessionscope-judge`). A folder from the very first ccmeter days (`~/.ccmeter`) is the same path as the new one.
- **Migration:** `ccmeter setup` copies the newest older folder to `~/.ccmeter` once, only when `~/.ccmeter` does not exist;
  replaces the plugins `agent-lens@agent-lens` / `sessionscope@sessionscope` and a status line under either old command.
- **Immutable:** migration v1 and `core/migrations.lock.json` untouched.

**Consequences.** On the owner's machine `~/.ccmeter` still holds a pre-rename copy: move it aside before running setup, or the
copy is skipped and the old database is used. The live install keeps running `agent-lens@agent-lens` until the owner runs
`npm run build` and `ccmeter setup` (nothing here did). Dashboard saved filters reset once. GitHub repo name is the owner's.
