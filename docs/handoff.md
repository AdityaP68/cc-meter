# Active task handoff

**Updated:** 2026-10-19
**Branch:** `main`. Milestones `m1`, `m2` tagged and pushed.
History of earlier hand-offs: `git log -p -- docs/handoff.md`.

## Where things stand
2026-10-19: renamed ccmeter -> sessionscope -> **agent-lens** (ADR 0011) with a new dashboard identity; live install migrated and built
(`~/.agent-lens`, plugin `agent-lens@agent-lens`; backups `~/.claude/settings.json.pre-agent-lens-backup`, `~/.sessionscope`, `~/.ccmeter`
kept). Real `doctor`: 0 errors, 2 warnings (Claude Code 2.1.302 newer than the verified 2.1.295 -> `format-drift`).
Two parallel branches are now both merged into `main` locally: **M3 reviewer** (built, live, ADR 0009 accepted, one real review
2026-10-19, $0.0178, estimate ~10 % low) and the **Docs section** (route `#/docs`, 12 pages in `docs/guide/`, 183 tests green;
dashboard not rebuilt, so `dist` lacks it until `npm run build`). Not pushed.

## Next

1. **Sweep the Docs text** (it predates agent-lens and M3): `docs/guide/*`, `docs/USAGE.md` (now an index; old USAGE incl. "Reviewing a
   session": `git show 8c1bf77:docs/USAGE.md`). Names (`~/.agent-lens`, `AGENT_LENS_HOME`, `x-agent-lens`, `/agent-lens`, legacy
   fallbacks documented on purpose, so no blind sed), add a Reviewing page (guide still says "not released"), re-run the fact-check
   against the code, `react-check`. Guide numbers marked "date not recorded" (17 versions, 62 files, price checks) need a dated survey.
   Unfixed oddities it documents: all-unpriced session prints `$0.000+unpriced`; `--url-only` not a registered switch; `report --by
   <bad>` silently lists sessions; `setup --uninstall` prints success if `claude` failed.
2. M3 follow-ups: a dashboard review view; judge runs use folder `agent-lens-judge` (recorder tags them; the first review's older
   `judge` folder stays untagged); a skill's `$ARGUMENTS`/`!` expansion is unverified (no test runs the skill).
3. `format-drift` for Claude Code 2.1.302 so `doctor` is back to 0 warnings. Zero spend.
4. `agent-lens audit` command (reconcile vs cost-state, optional OTel events file; exit non-zero on unexplained difference). Ask first:
   placement (new command, recommended) and OTel input.
5. Open with the owner: ADR 0009 O3 (gate 85 %, gold-set labeller), CSV export with review text, "server only" meaning, interactive
   OTel run. Owner-only: rename the GitHub repo, delete `~/.ccmeter` and `~/.sessionscope`, `npm link`, trademark check.
6. Agents may `git push origin main` (since 2026-10-19). Never force-push or publish without asking.
