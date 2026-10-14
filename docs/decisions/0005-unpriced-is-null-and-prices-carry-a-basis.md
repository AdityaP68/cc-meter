# 0005 — Unpriced is NULL, and every price says whether it was verified

**Status:** accepted 2026-10-14

**Decision.** A model missing from `pricing.json` (plus the user's `~/.ccmeter/pricing.json`) costs `NULL`, is
excluded from dollar totals and shown as "+ unpriced". Each price has `basis: verified` (reproduces Claude
Code's own `costUSD`, `ccmeter doctor --verify-pricing`) or `list` (published price, unchecked). Cache writes are
priced by TTL (5m 1.25×, 1h 2× input); Claude Code's main thread uses 1h, subagents 5m (observed).
