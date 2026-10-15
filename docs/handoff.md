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

1. **Ask the user to push** (`git push origin main`; agent push is denied). Check `git log --oneline origin/main..main`
   and `git status` first; other sessions share this checkout.
2. *(done 2026-10-15)* Why subagent replies are saved mid-stream: recorded in `docs/FORMATS.md` Known discrepancies item 1
   (observed vs hypothesis; not preventable by the user as far as observed). Open: whether `cli`/`sdk-cli` subagents
   behave the same needs a paid experiment (ask first); OTel `api_request` events (item 3) are the exact-source candidate.
3. **Task 2 (hidden calls), report to the user before building.** Measured (FORMATS.md item 2, 2026-10-15): in 7
   sessions Claude Code's tokens are >= ccmeter's in every class, gap $32.28; an estimate is feasible there only.
   OTel `api_request` events (docs only, FORMATS.md "OpenTelemetry export") could count every call via a
   127.0.0.1 receiver. Verifying needs a **paid** `claude -p` run in an isolated `CLAUDE_CONFIG_DIR` with the
   plugin disabled: **ask the user first**. Never edit the user's `~/.claude/settings.json`.
4. **Bug found, not fixed (offer it):** hook mode can drop a payload under load: `readStdinJson`
   (`cli/commands/record.ts`) read nothing once (`tests/cli.test.ts` failed 1 of ~15 runs; that run's
   record.log says `hook ? without transcript_path`). Likely an EAGAIN read of a pipe on fd 0; the next
   Stop hook re-records, so impact is a delay. Reproduce, then read stdin robustly (retry on EAGAIN).
5. The user's running dashboard server still has the old 240-minute idle stop until it restarts
   (`ccmeter serve --stop`; `/ccmeter` starts it again).
6. Older follow-ups (offer): `/api/refresh` should reload `pricing.json`; React's MIT notice before a public release.
   Roadmap (user picks): M3 review, budgets, context-size view, cache view, period compare, interactive filter.
7. Before changing `core/`, `cli/`, `server/` or `plugin/`: `npm run verify`, then `npm run build` (live install).
