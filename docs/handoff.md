# Active task handoff

**Updated:** 2026-10-19
**Branch:** `main`. Milestones `m1`, `m2` tagged and pushed.
History of earlier hand-offs: `git log -p -- docs/handoff.md`.

## Where things stand
2026-10-19: renamed ccmeter -> sessionscope (live install migrated) -> **agent-lens** (ADR 0011). The agent-lens rename and the new
dashboard identity are committed on branch `rename-agent-lens` (verify --full green, 181 tests; isolated fresh-clone install with both
old plugins and old data passed). **Live migration pending owner approval**: merge the branch into `main`, `npm run build`,
`node dist/cli/index.js setup` in the real home (copies `~/.sessionscope` to `~/.agent-lens`, replaces the old plugin), back up
`~/.claude/settings.json` first, then real `doctor`. Real `doctor` today: 0 errors, 2 warnings (Claude Code 2.1.302 newer than the
verified 2.1.295 -> `format-drift`).

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
