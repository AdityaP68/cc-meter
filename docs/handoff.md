# Active task handoff

**Updated:** 2026-10-15
**Branch:** `main`. Milestones `m1`, `m2` tagged; the context harness was added after `m2`.
History of earlier hand-offs: `git log -p -- docs/handoff.md`.

## Where things stand
2026-10-15: fixed the user's reports and reviewed the project. Committed: blank page after navigating (`82bf4ae`),
fallback label for untitled sessions and an explicit empty Flags cell (`a71f679`), overview totals now match the
chart (`d391dc6`), record hook always exits 0 (`038ff40`). Built (`dist/` is live) and `doctor` is clean.
The review findings are not fixed yet. They are in the shared notes file `review-2026-10-15.md` (path in the chat
report) and in the commit bodies. Since then: happy-dom DOM smoke test (`7509466`) and skill `react-check`
(`e6ee5d2`), both docs/tests/tooling only. Re-checked 2026-10-15: no `core/`, `cli/`, `server/`, `plugin/` or
`dashboard/src/` file changed after this hand-off, so the findings below still apply; `npm run verify` passes
(106 tests); real `doctor` 0 warnings, 0 errors. `main` is pushed (e6ee5d2); tags `m1`, `m2` are not.
Uncommitted: nothing (before this refresh).

## Next

1. **Get the user's go-ahead on the review fixes, then do them in this order** (each one: test first, then
   `npm run verify`, commit, `npm run build`, real `ccmeter doctor`). Stop after each commit if `doctor` warns.
   a. Unpriced models show `$0` in the reconciliation tables, the MixBar tooltip and `export`. Files:
      `dashboard/src/pages.tsx`, `cli/commands/report.ts`, `dashboard/src/charts.tsx`, `cli/commands/export.ts`.
   b. Validate the `~/.ccmeter/pricing.json` override (finite numbers, `Object.hasOwn`); NaN must become null.
      File: `core/pricing.ts`.
   c. `readCostState` must not throw on a malformed `modelUsage` entry. File: `core/parser/cc21.ts`.
      If parsing changes, bump `RECORDER_VERSION`.
   d. Make `migrate()` race-safe: `BEGIN IMMEDIATE`, then re-read `user_version`. File: `core/db.ts`.
   e. Clamp the server's `limit`/`offset`. Make setup refuse to overwrite an unparsable `settings.json`.
2. **Ask the four open decisions if they are still unanswered** (one message): (a) "the complaint parameter";
   (b) `node:sqlite` or `better-sqlite3`; (c) M3 judge via `claude -p` or the direct API; (d) keep or drop
   `plugin/commands/ccmeter.md`.
3. **Roadmap (the user picks; nothing is approved yet):** M3 session review; per-project budgets and alerts;
   context size over time with long-session warnings; cache-efficiency view; comparing periods; a filter for
   interactive vs headless sessions. Ranking: the chat report of 2026-10-15.
4. Before changing `core/`, `cli/`, `server/` or `plugin/`, run `npm run verify` and run `npm run build` only
   when it passes. `dist/` is the user's live install.
