---
paths:
  - "pricing.json"
  - "core/pricing.ts"
  - "core/reconcile.ts"
---
# Pricing

- Unknown model → `null` cost ("unpriced"), never 0 (decision 0005).
- Every price carries `basis`: `verified` only if `sessionscope doctor --verify-pricing` shows it reproducing Claude
  Code's own `costUSD`; otherwise `list`. Never upgrade a basis without that evidence.
- Prices come from a source (the `claude-api` skill's table, vendor pricing page) recorded in `docs/references.md`,
  never from memory. Cache writes: 5m and 1h tiers are different prices.
- Changing a price changes the table hash, so stored sessions are re-costed on the next record; say so to the user.
