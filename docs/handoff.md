# Active task handoff

**Updated:** 2026-10-15
**Branch:** `main`. Milestones `m1`, `m2` tagged and pushed.
History of earlier hand-offs: `git log -p -- docs/handoff.md`.

## Where things stand
2026-10-15: the six review fixes are done, each its own commit with the test written first (hashes in
`docs/status.md`): unpriced never `$0` (reconciliation tables, MixBar tooltip, export `costUsd` + `costComplete`);
`pricing.json` override validated (bad entries ignored, `doctor` check `pricing-override`); `readCostState`
tolerates malformed `modelUsage` (no `RECORDER_VERSION` bump: output is unchanged for input that parsed before);
race-safe `migrate()`; server `limit`/`offset` clamped; `setup --statusline` refuses an unparsable
`settings.json`. `npm run verify` passes (124 tests); `dist/` rebuilt after each commit; real `doctor` 0 warnings.
Owner decisions are in `docs/decisions/0007-*`: compliance parameters, `node:sqlite`, M3 judge via `claude -p`.
Not done: the unpriced display change was not looked at in the browser (fixtures have no unpriced model).
`main` and tags `m1`, `m2` pushed by the user on 2026-10-15 (origin/main at `461aa55`). Later the same day: Flags
column alignment (`59acbe4`) and Health/doctor accuracy (`dee1894`), built and live. The user is pushing these (agent `git push` is denied by permissions);
check `git status -sb`.

## Next

1. **Nothing is blocking.** Pushed; the command file `plugin/commands/ccmeter.md` is kept (decided). Pushing from an
   agent session needs a `git push` permission rule; the user ran the push themselves.
2. **Open question from the user: keeping prices current as models are released.** Options given in chat 2026-10-15:
   (1) manual as now; (2, agent's recommendation) while a model is unpriced, show Claude Code's own `cost-state` cost
   for it in Health, and let `doctor` suggest rates derived from cost-state, labelled `derived`; (3) online price
   fetch, rejected (no-network rule). Ask the user to choose; nothing is built. Current mechanism: unknown model = unpriced + `doctor` warning; fix by editing
   `pricing.json` (repo) or `~/.ccmeter/pricing.json`; `format-drift` skill after a Claude Code release.
3. **Optional follow-ups:** look at the unpriced rows in the browser (`dashboard-check` with a transcript using an
   unknown model, isolated `CCMETER_HOME`); check that the dashboard bundle ships React's MIT notice before any
   public release.
4. **Roadmap (the user picks; nothing is approved yet):** M3 session review (design: `docs/ARCHITECTURE.md` §3, judge
   via `claude -p`); per-project budgets and alerts; context size over time with long-session warnings;
   cache-efficiency view; comparing periods; a filter for interactive vs headless sessions.
5. Before changing `core/`, `cli/`, `server/` or `plugin/`, run `npm run verify` and run `npm run build` only
   when it passes. `dist/` is the user's live install.
