---
name: format-drift
description: Check and adapt ccmeter after a Claude Code release, when doctor warns about an unverified version, unknown entry types or unknown usage fields, or when the orientation hook says Claude Code is newer than the verified range. Zero spend.
---

# Format drift

Goal: a new Claude Code release yields correct data or a precise warning (decision 0004). No guessing.

1. **Measure.** `ccmeter doctor` and `claude --version`. Note: unverified versions, unknown types, unknown usage
   keys, unparsable lines, token-match count against `cost-state`.
2. **Survey, isolated.** Delegate to the `transcript-surveyor` subagent: for transcripts whose `version` is outside
   the range in `core/parser/cc21.ts`, report entry-type counts, assistant/usage key sets, duplicate-id behaviour,
   new `system` subtypes, and per-model token match against `cost-state`. Aggregates only.
3. **Decide.**
   - Nothing changed → extend `verifiedRange` in `cc21.ts`; add one small fixture from the new version
     (`node scripts/make-fixture.mjs <in> fixtures/cc-<ver>/<name>.jsonl`), regenerate goldens
     (`node scripts/make-golden.mjs`), record the version in `docs/FORMATS.md`.
   - A new harmless type/key → add it to the known lists in `cc21.ts` with a FORMATS.md entry.
   - Semantics changed → new parser module, register in `PARSERS`, bump `RECORDER_VERSION`, fixtures + goldens.
4. **Verify**: `npm run verify`. Stop and report to the user before `npm run build` (that changes their live hooks).
5. Record the outcome: `docs/status.md` line; lesson if something surprised you.
