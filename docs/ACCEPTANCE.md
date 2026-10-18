# Acceptance for v1: how each criterion was checked, and how to repeat it

This file holds procedures and aggregate results only. Per-session numbers from the author's own machine are reported in the review conversation, not committed, because session titles and paths are personal data.

## 1. "Token totals match API-reported usage on a sample of real sessions"

The transcript's `message.usage` *is* the API-reported usage. Two independent checks:

1. **Claude Code's own accounting.** Each transcript can contain a `cost-state` entry with Claude Code's per-model token totals. `ccmeter report --session <id>` prints ccmeter's totals and Claude Code's side by side; `ccmeter doctor` prints how many (session, model) pairs match. Result on the author's corpus (2026-10-14): **306 of 310 sessions match exactly** (input, output, cache-write, cache-read per model); the 4 that do not are explained in `docs/FORMATS.md` → *Known discrepancies* (extra server-side calls in interactive sessions, subagent output snapshots, and a session spanning several processes where `cost-state` covers less than the transcript).
2. **Naive oracle in the tests.** `tests/helpers/oracle.ts` re-implements "sum usage per message id, last entry wins" with no shared code; `tests/golden.test.ts` requires equality on every fixture, and requires equality with Claude Code's `cost-state` on the complete-session fixtures.

3. **Independent third source: OpenTelemetry (2026-10-18, Claude Code 2.1.302).** A paid Haiku 5.5 `claude -p` run (Bash call plus one subagent, ~$0.0074) exported `claude_code.api_request` events to a loopback receiver. All 4 API calls matched ccmeter's per-message tokens (including the 5m/1h cache split) and cost exactly, and the totals equal `cost-state` and the CLI's reported `total_cost_usd`. One tiny non-interactive run: it proves the transcript path and Haiku 5.5 pricing for that shape, not the interactive hidden-call gap. Details in `docs/FORMATS.md` → *OpenTelemetry export*.

Prices: `ccmeter doctor --verify-pricing` (Sonnet 5.5: 299/299 sessions in range, 297 exact to < $0.00001; Haiku 4.5: 10/10; Opus 5.5: 3/3; Opus 5: list price only).

## 2. "A new Claude Code release yields either correct data or a clear doctor warning"

- Version drift: `tests/doctor.test.ts` feeds versions above, below and outside every parser; `doctor` warns each time, and flags already-recorded sessions with unverified versions.
- Format drift: unknown entry types and unknown `usage.*` keys are counted per session and listed by `doctor` (tested with synthetic entries).
- Real-world evidence: the corpus spans 17 Claude Code versions (2.1.236 … 2.1.295) and parses with zero unknown entry types and zero unparsable lines.
- What this does **not** prove: a future release that keeps every known field but changes its meaning would not be detected. The golden fixtures and `--verify-pricing` are the guard rails for that.

## 3. "A teammate can go from clone to working dashboard in under 5 minutes"

Measured: `git clone` + `./install.sh` (npm ci, build, plugin install in an isolated Claude config, backfill, doctor) took **5 seconds** with a warm npm cache. A cold install adds only the download of ~47 dev packages (no runtime dependencies). Then `ccmeter serve --open` (or `/ccmeter`).

To repeat in isolation without touching your own setup:
```bash
T=$(mktemp -d); git clone . $T/ccmeter && cd $T/ccmeter
CLAUDE_CONFIG_DIR=$T/claude CCMETER_HOME=$T/home ./install.sh
```

## Milestone checklists

**M1** — parser isolated and version-selected ✔ · streaming-duplicate dedup (last wins) ✔ · sidechain tagging, never counted as a switch ✔ · synthetic messages ignored ✔ · per-message tokens and per-session totals/cost/models/switches/compactions/turns/project ✔ · `unpriced`, never zero ✔ · idempotent recorder, `source`, judge tag ✔ · `reviews` placeholder ✔ · `doctor` ✔ · `install.sh` ✔ · unit + golden tests ✔ (92 tests).

**M2** — local API + SPA (sessions, detail with per-turn timeline and markers, rollups by day/project/model) ✔ · `serve` lazy start, 127.0.0.1, optional browser open ✔ · `/ccmeter` one line ✔ (verified headlessly; interactive not verified) · statusLine command ✔ (stdin payload from docs, not captured live) · unpriced models and doctor warnings visible ✔.

**M3** — design only, in `docs/ARCHITECTURE.md`; `ccmeter review` is a stub.
