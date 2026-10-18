# Active task handoff

**Updated:** 2026-10-19
**Branch:** `main`. Milestones `m1`, `m2` tagged and pushed.
History of earlier hand-offs: `git log -p -- docs/handoff.md`.

## Where things stand
2026-10-19: **renamed to `agent-lens`** (ADR 0010, commits `fe175dd`..): live install migrated and built (`~/.agent-lens`, plugin
`sessionscope@sessionscope`, old plugin replaced, `~/.claude/settings.json.pre-sessionscope-backup` kept, `~/.ccmeter` kept). Isolated
fresh-clone install tested; verify green (177 tests). Real `doctor`: 0 errors, 2 warnings, both because Claude Code 2.1.302 is newer than
the verified 2.1.295 (run the `format-drift` skill). Earlier 2026-10-19: Health accuracy report, OTel test (exact), agent push allowed.

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
   `~/.ccmeter` when satisfied, `npm link` for a `sessionscope` command on PATH (hooks work without it), trademark check.
5. Agents may `git push origin main` (since 2026-10-19). Never force-push or publish without asking.
