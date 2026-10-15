# Active task handoff

**Updated:** 2026-10-15
**Branch:** `main`. Milestones `m1`, `m2` tagged and pushed.
History of earlier hand-offs: `git log -p -- docs/handoff.md`.

## Where things stand
2026-10-15: unpriced-model support is built (ADR 0008), one commit per part, tests first, verify passing (139
tests), built and live, real `doctor` 0 warnings: (a) upfront prompt: banner on every dashboard page, `⚠ unpriced:
<model>` in the status line, first line of `ccmeter report`; (b) Claude Code's own `cost-state` figure for an unpriced
model in Health/`doctor` and the session page, never in ccmeter's totals; (c) `doctor` suggests a `derived` price by
least squares (`core/derive.ts`), printed as a snippet, never written. Checked in the browser on an isolated copy with
synthetic `claude-mystery-9` sessions. Earlier today: review fixes, Flags alignment, Health accuracy (`docs/status.md`).
Not pushed: commits after `3f231b5`.

## Next

1. **Ask the user to push** (`git push origin main`; agent `git push` is denied by permissions).
2. **Follow-ups found while building (not approved; offer them):** the server loads `pricing.json` once at start, so a
   pasted price shows in the dashboard only after `ccmeter serve --stop` and a restart (make `/api/refresh` reload
   it); `index.html` can be served from browser cache after a rebuild, showing old UI until a hard reload (send
   `Cache-Control: no-store` for it); React's MIT notice in the dashboard bundle before any public release.
3. **Roadmap (the user picks; nothing is approved yet):** M3 session review (design: `docs/ARCHITECTURE.md` §3, judge
   via `claude -p`); per-project budgets and alerts; context size over time with long-session warnings;
   cache-efficiency view; comparing periods; a filter for interactive vs headless sessions.
4. Before changing `core/`, `cli/`, `server/` or `plugin/`, run `npm run verify` and run `npm run build` only
   when it passes. `dist/` is the user's live install.
