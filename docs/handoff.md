# Active task handoff

**Updated:** 2026-10-15
**Branch:** `main`. Milestones `m1`, `m2` tagged; the context harness was added after `m2`.
History of earlier hand-offs: `git log -p -- docs/handoff.md`.

## Where things stand
ccmeter M1+M2 are complete and installed on the user's machine from this checkout (live: `dist/` and
`plugin/` here are what their Claude Code runs). The user is using it and doing a read-through; they
said they will come back with questions and feedback. Nothing is in progress. The agent harness
(`docs/harness.md`) is in place and its hooks were verified live, including the context guard.

## Next

1. **Wait for the user's feedback; do not start new feature work unprompted.** When it arrives, triage
   each point into: bug (reproduce with a test first, then fix), wording/UX, or decision. Files likely
   involved: `plugin/scripts/prompt-hook.sh`, `dashboard/src/*`, `cli/commands/*`. Stop after
   reporting the triage and get approval for anything beyond bug fixes.
2. **Ask the four open decisions if the user has not answered them** (one message, concise):
   (a) what "the complaint parameter" means; (b) keep `node:sqlite` (Node ≥ 22.13) or switch to
   `better-sqlite3`; (c) M3 judge via `claude -p` (default) or direct API (needs approval: network +
   key handling); (d) keep `plugin/commands/ccmeter.md` (≈16 tokens/session) or rely on the hook alone.
3. **Before any change to `core/`, `cli/`, `server/` or `plugin/`:** run `npm run verify`, then
   `npm run build` only when it passes, because the user's live hooks run `dist/`. Confirm with
   `ccmeter doctor` (real install) that nothing regressed. Stop and tell the user if `doctor` warns.
4. **If `claude --version` is newer than the parser's verified range** (the hook says so), run the
   `format-drift` skill before anything else. Zero spend; stop after reporting findings.
5. **M3 only after the user approves the judge mechanism (2c).** Design: `docs/ARCHITECTURE.md` →
   Milestone 3. Paid judge runs need an explicit cost ceiling from the user.
