---
paths:
  - "core/db.ts"
  - "core/record.ts"
  - "core/aggregate.ts"
  - "core/migrations.lock.json"
---
# Database and recorder

- Migration v1 is applied to the user's real database. Shipped migrations are immutable: add `version: N+1`
  (enforced by `core/migrations.lock.json` + `scripts/harness/check.mjs`). Lock a new migration with
  `node scripts/harness/check.mjs --lock-migrations` only when it ships.
- The recorder recomputes whole sessions inside one transaction; keep it idempotent and silent in hook mode
  (no stdout, exit 0, errors to `record.log` without content).
- Bump `RECORDER_VERSION` in `core/record.ts` whenever parsing or costing logic changes, so stored rows recompute.
- Batch operations must report per-item error counts (a silent 0/0 hid a broken schema once).
- Never store prompt, reply or tool text. Hook payloads' `last_assistant_message` is never read.
