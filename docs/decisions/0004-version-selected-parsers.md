# 0004 — One isolated parser per Claude Code format, selected by the version in the transcript

**Status:** accepted 2026-10-14

**Context.** The desktop app embeds its own Claude Code, so transcripts can be newer than `claude --version`
(2.1.295 seen while the CLI was 2.1.287). Formats change without notice.

**Decision.** Only `core/parser/` knows the format. The parser is chosen from the transcript's own `version`; the
result carries a status (`verified`, `unverified-newer/older`, `fallback`, `no-version`). Unknown entry types and
`usage` keys are counted per session and surfaced by `doctor`, never fatal.

**Consequences.** A new release yields correct data or a named warning. Procedure: skill `format-drift`.
