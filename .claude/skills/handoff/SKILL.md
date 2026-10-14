---
name: handoff
description: Update docs/handoff.md (and current/status) so the next session can resume ccmeter work with no manual context. Use at the end of a task or session, after a milestone, when the context guard asks, or when the user says hand off, wrap up, or we'll continue later.
---

# Hand off

The next session receives `## Next` automatically (SessionStart hook, capped at 2,500 characters). Write it for an
agent that has none of this conversation.

1. **Commit or stash first** (`npm run verify` before committing). Name any uncommitted file left on purpose.
2. **Rewrite `## Next`**, do not append. Numbered, most important first. Each item: what to do in one line; the
   exact files and commands; its **stop point** and any approval it needs; what is already done.
3. **Update the headers**: `**Updated:**` dates in `docs/handoff.md` (and `docs/current.md` if the state changed).
4. **Move finished work out**: one line in `docs/status.md`; a durable choice → `docs/decisions/`; a reusable lesson
   with evidence → `docs/memory/lessons.md` (+ a `.claude/rules/` line if it has a directory home).
5. `node scripts/harness/check.mjs --all` must pass (size and header limits), then commit the hand-off.
6. Tell the user they can start a fresh session and type `resume`.
