---
name: milestone-close
description: Close a ccmeter milestone — full verification, fresh-clone install test in isolation, real doctor, docs and handoff updates, and a tag. Use when the user says a milestone is done, wants to tag or release, or asks whether ccmeter is ready.
---

# Milestone close

1. `npm run verify -- --full` must pass.
2. Fresh clone, isolated:
   `T=$(mktemp -d); git clone -q . $T/c && cd $T/c && CLAUDE_CONFIG_DIR=$T/claude CCMETER_HOME=$T/home ./install.sh`
   then `npm test` there. Record the elapsed time (acceptance: clone→dashboard < 5 min).
3. Real install health: `ccmeter doctor` (read-only). Rebuild `dist/` for the live install only after 1–2 pass.
4. Check every acceptance criterion in `docs/ACCEPTANCE.md` and `docs/SCOPE.md` with evidence, not memory.
5. Update `docs/current.md`, one line in `docs/status.md`, rewrite `docs/handoff.md` `## Next`.
6. Commit, then `git tag -a mN -m "..."`. Never push or publish without the user's explicit approval.
