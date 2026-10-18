---
paths:
  - "docs/**/*.md"
  - "README.md"
  - "AGENTS.md"
  - "CLAUDE.md"
---
# Documentation

- Write for retrieval: tables, one topic per section, dated facts. Agents grep these; nobody reads them linearly.
- `current.md` and `handoff.md` are rewritten, never appended (`check.mjs` enforces headers and size limits).
  `status.md` gets one line per material change pointing at the commit.
- Numbers about the user's data are dated and never include session titles, paths or prompt text. No personal data
  in committed files (enforced by the pre-commit check).
- External sources go in `docs/references.md` in the same change.
- Claims must match the code: check a command, flag or path exists before documenting it. Mark unverified things.
- `docs/guide/*.md` is user documentation, compiled into the dashboard (`#/docs`) and rendered by `dashboard/src/docs-markdown.tsx`
  (subset: headings, lists, pipe tables, fences, bold/italic, `name.md` and `#/…` links; no nested lists or `_italics_`). Add a page
  in `dashboard/src/docs-content.ts` too. Fact-check every claim against code or a CLI run; label unverified Claude Code behaviour.
- Keep `CLAUDE.md` + `AGENTS.md` under 200 lines; move detail into rules, skills or docs.
