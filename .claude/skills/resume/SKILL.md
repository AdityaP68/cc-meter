---
name: resume
description: Resume work on agent-lens in a fresh or compacted session from docs/handoff.md without the user restating context. Use when the user says resume, continue, pick up where we left off, carry on, or next.
---

# Resume

The SessionStart hook has already injected Git state, the live-install status and the handoff's `## Next`.
Do not ask the user to restate context and do not re-read history.

1. **Check the injected state.** If the hook warned that the handoff is stale, that `dist/` is older than the
   sources while the install is live, or that Claude Code is newer than the parser's verified range, say so in one
   line and ask before continuing.
2. **Take item 1 of `## Next`.** Read only the files it names, plus `docs/current.md` if a number or decision is
   needed. Say in one sentence what you will do and where you will stop.
3. **Do it with the loop**: `npm run verify -- --changed` while editing, `npm run verify` before claiming done.
4. **Stop at the item's stop point**, especially before anything needing approval (network, paid runs, writing to
   the user's `~/.claude` or `~/.agent-lens`, publishing, force-pushing).
5. **Before ending, run the `handoff` skill.**

If `## Next` is empty, ask the user what to do; do not invent a roadmap.
