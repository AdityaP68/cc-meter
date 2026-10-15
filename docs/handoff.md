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
column alignment (`59acbe4`) and Health/doctor accuracy (`dee1894`), built and live. Pushed by the user (origin/main `0960472`).

## Next

1. **Build "unpriced-model support" (approved by the user 2026-10-15, option 2).** Test first for each part; one
   commit per part; `npm run verify`, `npm run build`, real `ccmeter doctor` after each; `dashboard-check` for UI.
   a. **Upfront prompt** (the user's words: "prompt upfront that an untracked model is detected; update it or run the
      doctor command"): a banner at the top of every dashboard page while any recorded model is unpriced, naming
      the model(s) and saying: add a price to `~/.ccmeter/pricing.json` (or the repo's `pricing.json`), or run
      `ccmeter doctor`. Also a short marker in the status line (e.g. `⚠ unpriced: <model>`) and a header line in
      `ccmeter report`. Never inside the Claude Code conversation (zero-context-footprint rule; hooks print nothing).
   b. **Claude Code's own cost as a stopgap:** for an unpriced model, show the `costUSD` that `cost-state` recorded
      for it (summed over sessions that have one) in Health, `doctor` and the session page, labelled "Claude Code's
      figure", never mixed into ccmeter's own totals (unpriced stays NULL, ADR 0005).
   c. **Derived rates:** `doctor` suggests rates for an unpriced model from its `cost-state` entries (least squares over
      input/output/cacheRead/cacheWrite; needs enough sessions with varied token mixes; print the fit error and the
      sample count; refuse when underdetermined). Output is a JSON snippet with `"basis": "derived"` for the user to
      paste; ccmeter never writes the user's pricing file itself. Add `derived` as a valid basis in `core/pricing.ts`
      validation and the Health table. ADR 0008.
2. Agent `git push` is denied by permissions; the user pushes.
3. **Optional follow-ups:** look at the unpriced rows in the browser (`dashboard-check` with a transcript using an
   unknown model, isolated `CCMETER_HOME`); check that the dashboard bundle ships React's MIT notice before any
   public release.
4. **Roadmap (the user picks; nothing is approved yet):** M3 session review (design: `docs/ARCHITECTURE.md` §3, judge
   via `claude -p`); per-project budgets and alerts; context size over time with long-session warnings;
   cache-efficiency view; comparing periods; a filter for interactive vs headless sessions.
5. Before changing `core/`, `cli/`, `server/` or `plugin/`, run `npm run verify` and run `npm run build` only
   when it passes. `dist/` is the user's live install.
