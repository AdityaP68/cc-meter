---
paths:
  - "core/parser/**"
  - "core/session.ts"
  - "core/jsonl.ts"
  - "fixtures/**"
  - "scripts/make-fixture.mjs"
  - "scripts/make-golden.mjs"
  - "docs/FORMATS.md"
---
# Parser, fixtures and formats

- Only `core/parser/` knows the transcript format. A new Claude Code format means a new `ccNN.ts` registered in
  `PARSERS`, not branches inside `cc21.ts` (decision 0004). Skill: `format-drift`.
- Observe before coding: every format fact goes in `docs/FORMATS.md` with the Claude Code version and how it was
  seen; anything not seen is listed under "Not verified".
- Split JSONL on `\n` only; never `readline` (U+2028 inside strings).
- One API request per `message.id`, last entry wins. Ignore `<synthetic>`/`isApiErrorMessage`. Unknown entry types
  and `usage` keys are counted in `ParseStats`, never thrown.
- Sidechain (subagent) messages are tagged and never count as model switches.
- Fixtures come only from `scripts/make-fixture.mjs` (redacts every free-text string). After generating one, the
  pre-commit check scans for paths, emails, usernames; also eyeball it. Never hand-edit a fixture.
- `*.expected.json` are regenerated with `scripts/make-golden.mjs` only after the oracle tests agree; review the
  diff. A golden change without a code or fixture change is a bug.
- Survey real transcripts through the `transcript-surveyor` subagent: aggregates only, never raw text in context.
