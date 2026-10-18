# Active task handoff

**Updated:** 2026-10-18
**Branch:** `main`. Milestones `m1`, `m2` tagged and pushed.
History of earlier hand-offs: `git log -p -- docs/handoff.md`.

## Where things stand
2026-10-17/18: scope v2 drafted (docs only). 2026-10-15: unpriced-model support is built (ADR 0008), one commit per part, tests first, verify passing (139
tests), built and live, real `doctor` 0 warnings: (a) upfront prompt: banner on every dashboard page, `⚠ unpriced:
<model>` in the status line, first line of `ccmeter report`; (b) Claude Code's own `cost-state` figure for an unpriced
model in Health/`doctor` and the session page, never in ccmeter's totals; (c) `doctor` suggests a `derived` price by
least squares (`core/derive.ts`), printed as a snippet, never written. Checked in the browser on an isolated copy with
synthetic `claude-mystery-9` sessions. Earlier today: review fixes, Flags alignment, Health accuracy (`docs/status.md`).
Not pushed: commits after `3f231b5`.

## Next

0. **Paid OTel accuracy test: done 2026-10-18** (`docs/FORMATS.md` OpenTelemetry, `docs/ACCEPTANCE.md` check 3): exact
   agreement OTel = transcript = `cost-state` = CLI `total_cost_usd` on one non-interactive run. Not covered: the
   interactive hidden-call gap (needs an interactive session with OTel on; ask the owner, it is their `settings.json`
   `env` or a paid interactive run). Scratch receiver and config are in the session scratchpad and may be gone.
1. **Docs are uncommitted** (SCOPE.md, GAPS.md, ADR 0009, status, references, current, handoff, lessons). Ask the
   owner to commit. ADR 0009 is **proposed**; O1 (store reviews) and O2 (test) answered, **O3 open**: gate (85 %
   proposed) and who labels the gold set. Two confirms: may CSV export include review text; "server only" means the
   dashboard DB on the Claude machine. Windows is unverified.
2. Owner also wants concrete accuracy proof for a closed environment: item 0 is done, so propose a `ccmeter audit` command
   (reproducible report: ccmeter vs cost-state vs OTel, plus the hidden-call gap). Code: ask first.
3. Then push (`git push origin main`; agent push is denied), and pick the Phase B order in `docs/SCOPE.md`.
4. Older follow-ups (offer): `/api/refresh` reload `pricing.json`; React MIT notice; running dashboard server needs
   `ccmeter serve --stop` to pick up the 30 min idle stop.
5. Before changing `core/`, `cli/`, `server/` or `plugin/`: `npm run verify`, then `npm run build` (live install).
