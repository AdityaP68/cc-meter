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

## 2026-10-15 — An expression-bodied effect can unmount the whole React app
`useEffect(() => window.scrollTo(0, 0))` returned a Promise in current Chromium. React called that Promise as the
cleanup on the next route change, threw, and blanked the page until a reload. Always give effects block bodies;
`tests/dashboard.test.ts` enforces this and `tests/dashboard-dom.test.ts` catches it at runtime. To find such
crashes, use an unminified build and log the bad `destroy` (skill `react-check`).

## 2026-10-15 — Headline totals and charts must share filter semantics
Filtering the overview by session start while the chart filtered by message time made the 7-day headline a third
of the chart's sum. Every total comes from per-message rows with the same WHERE clause.

## 2026-10-15 — Never put display:flex on a table cell
A `<td>` with `display:flex` leaves the table layout: it shrinks to its content and its border stops mid-row, so the
column looks skewed. Put the flex container inside the cell. Guarded by `tests/dashboard.test.ts`.

## 2026-10-15 — A label is not evidence
`pricing.json`'s `basis: list` made `doctor` say "not verified" while the evidence (Claude Code's own cost) matched.
Report what the data shows per model, and say explicitly when there is nothing to compare.

## 2026-10-15 — `process.stdin` makes fd 0 non-blocking
Touching `process.stdin` (even `.isTTY`) on a pipe opens fd 0 as a non-blocking stream; a later
`fs.readFileSync(0)` throws EAGAIN if the writer has not written yet, so hook mode silently read no payload under
load. Use `tty.isatty(0)` and `readStdinText` (`cli/stdin.ts`), which retries EAGAIN. Guarded by `tests/stdin.test.ts`.

## 2026-10-18 — An isolated `CLAUDE_CONFIG_DIR` is not logged in
A fresh `CLAUDE_CONFIG_DIR` makes `claude -p` answer "Not logged in" (`terminal_reason: api_error`, cost 0) and
`claude auth status` shows `loggedIn: false`; credentials are not shared with the default config. The user must log
in there themselves (agents never handle credentials). Check with `CLAUDE_CONFIG_DIR=<dir> claude auth status`
before any paid experiment. macOS has no `timeout` command; Bash calls touching `dist/` were denied in this setup, use `.test-dist/`.
