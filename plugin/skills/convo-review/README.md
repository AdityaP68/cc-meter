# convo-review (milestone 3 stub)

`SKILL.md.stub` is the intended skill: a thin wrapper that runs `sessionscope review <session-id>` out of process.
It is deliberately **not** named `SKILL.md` yet, because Claude Code lists every installed skill's name and description
in each session's context (measured: ~39 tokens, even with `disable-model-invocation: true`).
sessionscope's rule is zero context footprint until the feature exists.

When `sessionscope review` ships (see `docs/ARCHITECTURE.md`), rename the stub to `SKILL.md`.
