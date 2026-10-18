# 0010 — Rename ccmeter to sessionscope

**Status:** accepted 2026-10-19 (owner).

**Context.** "ccmeter" names one agent (cc = Claude Code) and a cost meter; the owner wants Copilot and other agents
supported later, and quality/review features beyond cost. Free on npm, PyPI and crates.io on 2026-10-19; trademark not checked.

**Decision.** Everything user-visible is `sessionscope`: package and bin, CLI, plugin `sessionscope@sessionscope` and
`/sessionscope`, `~/.sessionscope`, `sessionscope.db`, `SESSIONSCOPE_HOME`, `SESSIONSCOPE_JUDGE_RUNNING`, header
`x-sessionscope`, source tag `sessionscope-judge`, `*.sessionscope-backup`.
- **Fallbacks (read-only):** `CCMETER_HOME` and `CCMETER_JUDGE_RUNNING` are still honoured; with no environment variable,
  `~/.ccmeter` (and `ccmeter.db` inside any home) is read while `~/.sessionscope` does not exist (`core/paths.ts`, the
  launcher `plugin/scripts/sessionscope.sh`, the harness scripts); the stored tag `ccmeter-judge` still counts as a judge run.
- **Migration:** `sessionscope setup` copies `~/.ccmeter` to `~/.sessionscope` once (database renamed, `server.json` and `cache/`
  left out), never deletes or edits the old folder, replaces the plugin `ccmeter@ccmeter` and a `ccmeter statusline`
  status line. `doctor` warns while the old plugin is still installed.
- **Immutable:** migration v1 and `core/migrations.lock.json` are untouched; the database file name is not part of a migration.
- Earlier docs, ADRs and `docs/status.md` history keep their text where it describes what happened under the old name;
  other docs were renamed mechanically.

**Consequences.** Users of the old name keep working until they run `setup`. The dashboard's saved filters (localStorage key)
reset once. A `ccmeter` command left on PATH by `npm link` keeps pointing at `dist/cli/index.js` but is no longer documented.
