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

1. In parallel sessions (disjoint files): (a) prompt reviewer M3 (`docs/ARCHITECTURE.md` section Milestone 3; `claude -p` judge,
   consent prompt, no agent-lens network call; ADR 0009 still proposed, ask to accept first); (b) dashboard **Docs** section:
   route + page in `dashboard/src`, content written by role-split agents (concepts and accuracy, CLI/install how-to, fact-checker
   against `docs/FORMATS.md`), then `react-check`.
2. `format-drift` for Claude Code 2.1.302 (verified range ends 2.1.295) so `doctor` is back to 0 warnings. Zero spend.
3. `agent-lens audit` command (design: reconcile agent-lens vs cost-state, optional OTel events file or gateway export, exit
   non-zero on unexplained difference). Ask first: placement (new command, recommended) and OTel input.
4. Open with the owner: ADR 0009 O3 (gate 85 %, gold-set labeller), CSV export with review text, "server only" meaning.
   Interactive OTel run would size the hidden-call gap. Owner-only: rename the GitHub repo (then `git remote set-url`), delete
   `~/.ccmeter` and `~/.sessionscope` when satisfied, `npm link` for an `agent-lens` command on PATH (hooks work without it), trademark check.
5. Agents may `git push origin main` (since 2026-10-19). Never force-push or publish without asking.
