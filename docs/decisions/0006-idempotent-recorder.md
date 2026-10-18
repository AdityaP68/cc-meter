# 0006 — Idempotent full-recompute recorder; three paths to freshness

**Status:** accepted 2026-10-14

**Decision.** `sessionscope record` recomputes a whole session (main + subagent files) and replaces its rows in one
`BEGIN IMMEDIATE` transaction, skipping work when a signature (file sizes/mtimes, price-table hash, recorder
version) is unchanged. Freshness comes from an async Stop hook, a synchronous SessionEnd hook (1.5 s budget; the
largest transcript takes ≈ 0.2 s), and the dashboard server's 30 s rescan. Async Stop is cancelled at exit in
`-p` mode (observed), so SessionEnd is the guarantee there. Bump `RECORDER_VERSION` when logic changes.
