# Active task handoff

**Updated:** 2026-10-19
**Branch:** `main`. Milestones `m1`, `m2` tagged and pushed.
History of earlier hand-offs: `git log -p -- docs/handoff.md`.

## Where things stand
2026-10-19: Health page accuracy report built and pushed (`859aff3`); OTel test done (exact); agent push allowed; rename to
`sessionscope` approved, not started. `dist/` is still the old build (live hooks), `npm run build` happens in the rename.
2026-10-17/18: scope v2 drafted (docs only). 2026-10-15: unpriced-model support is built (ADR 0008), one commit per part, tests first, verify passing (139
tests), built and live, real `doctor` 0 warnings: (a) upfront prompt: banner on every dashboard page, `⚠ unpriced:
<model>` in the status line, first line of `sessionscope report`; (b) Claude Code's own `cost-state` figure for an unpriced
model in Health/`doctor` and the session page, never in sessionscope's totals; (c) `doctor` suggests a `derived` price by
least squares (`core/derive.ts`), printed as a snippet, never written. Checked in the browser on an isolated copy with
synthetic `claude-mystery-9` sessions. Earlier today: review fixes, Flags alignment, Health accuracy (`docs/status.md`).
Not pushed: commits after `3f231b5`.

## Next

0. **Rename sessionscope -> `sessionscope`** (owner approved 2026-10-19, incl. the live install). Free on npm/PyPI/crates, no
   project found (trademark unchecked). One writer, no parallel sessions until done. Tests first, `npm run verify`.
   Scope: package, CLI bin, plugin id (`sessionscope@sessionscope`), hooks, statusLine, env vars (`SESSIONSCOPE_HOME` ->
   `SESSIONSCOPE_HOME`, keep the old as a fallback), `x-sessionscope` header, docs, `AGENTS.md`. Immutable: shipped DB
   migrations and `core/migrations.lock.json` (keep the file name or add a rename-safe path); never edit v1.
   Live install (approved): COPY `~/.sessionscope` -> `~/.sessionscope` (never delete the old; read it as fallback);
   `setup` re-registers the plugin in the real `~/.claude`; then `npm run build`. Back up `~/.claude/settings.json`
   first. Verify in an isolated `CLAUDE_CONFIG_DIR`/`HOME` before touching the real one. Owner renames the GitHub repo.
1. After 0, in parallel sessions (disjoint files): (a) prompt reviewer M3 (`docs/ARCHITECTURE.md` section Milestone 3;
   `claude -p` judge, consent prompt, no sessionscope network call; ADR 0009 still proposed, ask to accept first);
   (b) dashboard **Docs** section: route + page in `dashboard/src`, content written by role-split agents (concepts and
   accuracy, CLI/install how-to, fact-checker against `docs/FORMATS.md`), then `react-check`.
2. `sessionscope audit` command (design in this thread: reconcile sessionscope vs cost-state, optional OTel events file or
   gateway export, exit non-zero on unexplained difference). Ask first: placement (new command, recommended) and OTel input.
3. Open with the owner: ADR 0009 O3 (gate 85 %, gold-set labeller), CSV export with review text, "server only"
   meaning. Interactive OTel run would size the hidden-call gap (needs their `settings.json` env or a paid run).
4. Agents may `git push origin main` (since 2026-10-19). Never force-push or publish without asking.
