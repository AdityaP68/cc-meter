# 0001 — Transcripts are the source of truth; Claude Code's cost-state is only an oracle

**Status:** accepted 2026-10-14

**Context.** Claude Code writes per-message `usage` into transcripts and, sometimes, a `cost-state` entry with its
own per-model totals. On the author's corpus they agree for 306 of 310 sessions; the four exceptions go in
**both** directions (`docs/FORMATS.md` → Known discrepancies): `cost-state` can include calls never written as
messages, and can cover less than the transcript in sessions spanning several processes.

**Decision.** All agent-lens numbers come from transcript messages (deduplicated by `message.id`, last entry wins).
`cost-state` is stored and shown side by side, used by `doctor`, `report --session` and the golden tests, and never
silently substituted.

**Consequences.** Some sessions are a lower bound (subagent snapshots, classifier calls); they are flagged
(`partial_messages`, `classifierRequests`) instead of hidden.
