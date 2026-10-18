# Active task handoff

**Updated:** 2026-10-19
**Branch:** `main`. Milestones `m1`, `m2` tagged and pushed.
History of earlier hand-offs: `git log -p -- docs/handoff.md`.

## Where things stand
2026-10-19: renamed ccmeter -> sessionscope -> **agent-lens** (ADR 0011), plus a new dashboard identity. **Live install migrated and built**:
`~/.agent-lens` (copied from `~/.sessionscope`, 394 sessions), plugin `agent-lens@agent-lens`, `dist/` rebuilt, main pushed (`ef06d5c`).
Backups: `~/.claude/settings.json.pre-agent-lens-backup`; `~/.sessionscope` and `~/.ccmeter` are kept. Real `doctor`: 0 errors, 2 warnings
(Claude Code 2.1.302 newer than the verified 2.1.295 -> `format-drift`). Parallel worktrees started before the rename (reviewer, docs
section) still carry the old name in their files: merge main into them before they commit.

## Next

1. (a) **Prompt reviewer M3 is merged into `main` and built (live, not pushed).** ADR 0009 accepted and one real review done
   (2026-10-19, $0.0178; estimate ran ~10 % low). Next: a dashboard review view. After the merge reviews target the one real DB (no migration was added). Judge runs now run in a folder named
   `agent-lens-judge` and the recorder tags any transcript from such a cwd (so `record --all` tags them; the first real review's
   transcript ran in an older `judge` folder and stays untagged, $0.018); `facets()` hides judge sessions. Known M3 gaps: a skill's
   `$ARGUMENTS` is user text in a pre-approved shell line;
   `$ARGUMENTS`/`!` expansion in a skill is unverified (no test runs the skill). (b) Dashboard **Docs** section (parallel session):
   route + page in `dashboard/src`, content written by role-split agents (concepts and accuracy, CLI/install how-to, fact-checker
   against `docs/FORMATS.md`), then `react-check`.
2. `format-drift` for Claude Code 2.1.302 (verified range ends 2.1.295) so `doctor` is back to 0 warnings. Zero spend.
3. `agent-lens audit` command (design: reconcile agent-lens vs cost-state, optional OTel events file or gateway export, exit
   non-zero on unexplained difference). Ask first: placement (new command, recommended) and OTel input.
4. Open with the owner: ADR 0009 O3 (gate 85 %, gold-set labeller), CSV export with review text, "server only" meaning.
   Interactive OTel run would size the hidden-call gap. Owner-only: rename the GitHub repo (then `git remote set-url`), delete
   `~/.ccmeter` and `~/.sessionscope` when satisfied, `npm link` for an `agent-lens` command on PATH (hooks work without it), trademark check.
5. Agents may `git push origin main` (since 2026-10-19). Never force-push or publish without asking.
