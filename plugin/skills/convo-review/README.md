# convo-review

`SKILL.md` is a thin wrapper. It runs `agent-lens review <session-id> --yes` out of process and shows the printed review.
The digest that is sent to the judge is built and used inside that process and is never loaded into the live session.

- Only the user can invoke it (`disable-model-invocation: true`); the model never starts a review.
- It cannot give the first-review consent: without consent stored by a terminal run of `agent-lens review <id>`, the
  command refuses and prints why.
- Cost of having it installed: Claude Code lists every installed skill's name and description in each session (about 20
  tokens measured on 2026-10-19 with `claude plugin details agent-lens` in an isolated config dir; the earlier, longer stub read 39).
  To go back to zero, rename `SKILL.md` to `SKILL.md.stub`.
- `scripts/harness/check.mjs` (`skillErrors`) fails the repository check if this file grows beyond that one command.
