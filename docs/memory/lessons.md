# Lessons

**Updated:** 2026-10-15 · Newest first.

## 2026-10-15 — Live experiments are contaminated by the installed plugin
Testing hook output variants with `claude -p --settings …` returned the *installed* ccmeter hook's text for every
variant. Disable it per run: `--settings '{"enabledPlugins":{"ccmeter@ccmeter":false}, …}'`. Rule: plugin.md.

## 2026-10-14 — An aggregate match rate can hide a whole class of failures
"517 of 521 sessions match Claude Code" was almost entirely Sonnet sessions; every Opus session mismatched.
Segment by model (and entrypoint) before reporting a rate.

## 2026-10-14 — Claude Code's own totals are not ground truth
`cost-state` exceeded the transcript in interactive sessions with server-side classifier requests, and was 17×
*lower* in a 42-day session spanning several processes. Show both; prefer neither (decision 0001).

## 2026-10-14 — Subagent transcripts keep mid-stream usage
79 % of final subagent message entries have `stop_reason: null` (≈ 9 output tokens each) vs 0 % in main
transcripts; Opus input/cache matched Claude Code to the token while output was 83k vs 659k. Output from subagents is
a lower bound; flag it.

## 2026-10-14 — Never parse JSONL with `readline`
It splits on U+2028/U+2029 inside JSON strings: 112 false "unparsable" lines in 57k. Split on `\n` only (`core/jsonl.ts`, test).

## 2026-10-14 — Count one API request per `message.id`, keep the last entry
One line per content block repeats the id (7,437 repeats in 14,978 entries); earlier copies can hold partial
usage. Last copy always had the maximum output in 5,102 groups.

## 2026-10-14 — Verify prices against Claude Code's numbers, not memory
Fitting `costUSD` exposed separate 5m/1h cache-write rates; an all-5m session reproduced Opus 5.5 only at the 5m rate.
`ccmeter doctor --verify-pricing` is the check.

## 2026-10-14 — Measure context cost of plugin components; flags are not free
A skill with `disable-model-invocation: true` still costs ≈ 39 tokens per session (`claude plugin details`).

## 2026-10-14 — Headless runs end before async hooks finish
An `async` Stop hook was "cancelled" in `claude -p`; only the synchronous SessionEnd recorded the session.

## 2026-10-14 — Surface per-item errors in batch operations
A stale dev database (migration edited in place) made every record fail while the refresh endpoint reported
`0 recorded, 0 unchanged`. Errors are counted in responses now; shipped migrations are locked
(`core/migrations.lock.json`).

## 2026-10-14 — Small operational traps
- `claude plugin marketplace add .` is rejected; use an absolute path or `./path`.
- `<session>/subagents/` also holds `agent-*.meta.json` sidecars; filter by `.jsonl`.
- Shell variables do not persist between agent tool calls; put isolation env vars on each command.
- A React measuring hook with an effect bound once missed elements mounted later; use a callback ref.
- Personal data (an email) reached a committed doc once; `scripts/harness/check.mjs` now blocks it.
