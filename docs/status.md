# Status log

**Updated:** 2026-10-19

Newest first. One line per material change, pointing at the commit or document. Reasoning lives in commit
bodies (`git show <sha>`); do not duplicate it here.

| Date | Change | Where |
|---|---|---|
| 2026-10-19 | Renamed again, sessionscope -> **agent-lens** (ADR 0011; owner chose the name): both earlier names stay readable (env vars, folders, db files, judge tags, plugins, status line); `setup` copies the newest old folder. Dashboard identity: lens mark, gradient wordmark, favicon, glass header, accent stat tiles (checked dark, light, 375 px). Isolated install with both old plugins installed passed; 181 tests | `8cf0a5d`, `0863442`, `docs/decisions/0011-*` |
| 2026-10-19 | Renamed ccmeter to **sessionscope** (ADR 0010): package, CLI, plugin `sessionscope@sessionscope`, `~/.sessionscope`, `SESSIONSCOPE_HOME`, `x-sessionscope`; old names read as fallbacks; `setup` copies `~/.ccmeter` once, replaces the old plugin and status line. Isolated fresh-clone install (legacy plugin + data -> new) passed; live install migrated (392 sessions, schema v1 untouched, 177 tests); real `doctor` 0 errors, 2 warnings, both Claude Code 2.1.302 being newer than the verified 2.1.295 (not rename related). Rows below keep the old name | `fe175dd`, `0368d06`, `docs/decisions/0010-*` |
| 2026-10-19 | Health page: accuracy report (exact sessions, hidden-calls estimate, partial records, price agreement, unpriced, unverified versions; two sources only, says so); `?` cursor on chips is now the normal one; every served number cross-checked against the raw DB (20 checks, 0 failures; 2026-10-19 copy: 391 sessions, 309 of 325 exact, 13 sessions ≈ $10.55 hidden calls) | `core/accuracy.ts`, `tests/accuracy.test.ts` |
| 2026-10-18 | Paid OTel accuracy test (Haiku 5.5, `claude -p` 2.1.302, Bash + subagent, ~$0.0074): 4 OTel `api_request` events equal the 4 transcript messages and ccmeter's cost exactly; totals equal `cost-state` and the CLI `total_cost_usd`. Interactive hidden-call gap not exercised | `docs/FORMATS.md`, `docs/ACCEPTANCE.md` |
| 2026-10-17 | Scope v2 (owner's analyst/org-layer scope) condensed into `docs/SCOPE.md`; ADR 0009 **proposed** (invariant conflicts and resolutions, open items O1–O3); gap taxonomy and playbook drafted (12 types, all `draft`, unreviewed). Docs only, no code | `docs/SCOPE.md`, `docs/decisions/0009-*`, `docs/GAPS.md` |
| 2026-10-15 | Accuracy audit of the user's data (independent re-parse of 624 transcripts): 8,365 messages equal the DB in tokens, flags and cost; sonnet-5-5 (297) and haiku-4-5 (11) exact-token sessions reproduce Claude Code's costUSD to $0; turns and models sum to every session total. Fixed: session list now matches the overview's sessions (was by start date), stale session shown during navigation, "slightly understated" replaced by the measured gap (≈ $23.06 in 2 sessions) | `a7dc057`, `8f0e392`, `06e1605` |
| 2026-10-15 | Dashboard: no "CC $x" chip where Claude Code's cost-state is provably partial (a model missing, or fewer tokens in a class); session page says so and that ccmeter's total is complete. User's data (388 sessions, 321 with cost-state): 3 partial, all 3 former CC chips | `35d095a`, `682d3a2` |
| 2026-10-15 | Subagent null `stop_reason` investigated: 79 % of subagent final messages, still present on 2.1.293/.295, tied to the last tool (Bash 97 %), not to aborts; not preventable by the user as far as observed | `docs/FORMATS.md` Known discrepancies item 1 |
| 2026-10-15 | Dashboard: "≈ $x not in transcript" estimate (Claude Code minus ccmeter) where Claude Code's cost-state covers the whole session; 10 sessions, ≈ $10.32 on the user's data | `4fd4306`, `d28fa43`, `f15c525` |
| 2026-10-15 | Hook mode no longer drops a stdin payload that arrives late (EAGAIN on a non-blocking fd 0; reproduced, fixed, tested) | `d5ea40c` |
| 2026-10-15 | Flag chips explain themselves (hover, focus, tap); server idle stop 30 min, memory checked (no leak found); hidden-calls gap measured, OTel export read (docs only) | `7635635`, `38a70ab`, `docs/FORMATS.md` |
| 2026-10-15 | `/ccmeter` labels its line: `ccmeter dashboard: <url>` | see `git log -- plugin/scripts/prompt-hook.sh` |
| 2026-10-15 | Unpriced-model support (ADR 0008): upfront prompt (dashboard banner, status line, report), Claude Code's figure as stopgap, `doctor` derived-price suggestion | `7b830d5`, `33dab76`, `e8fbb3d` |
| 2026-10-15 | Flags column aligned; Health/doctor accuracy: synthetic-only transcripts not "unrecorded", price evidence per model (incl. models with nothing to compare), largest Claude Code cost gap named | `59acbe4`, `dee1894` |
| 2026-10-15 | Review fixes: unpriced never `$0` in reconciliation/MixBar/export; `pricing.json` override validated (doctor `pricing-override`); `readCostState` tolerates malformed `modelUsage`; race-safe `migrate()`; server `limit`/`offset` clamped; `setup --statusline` refuses an unparsable `settings.json` | `ad35679`, `ff2f6f4`, `3928220`, `d340407`, `1a098df`, `1d9019f` |
| 2026-10-15 | Owner decisions: compliance parameters, `node:sqlite`, M3 judge via `claude -p` | `docs/decisions/0007-compliance-parameters-and-m3-judge.md` |
| 2026-10-15 | Skill `react-check` (route sweep, React pitfall scan, crash debugging, review) and a happy-dom DOM smoke test for the dashboard | `.claude/skills/react-check/`, `tests/dashboard-dom.test.ts` |
| 2026-10-15 | User-reported fixes: nav blank page, untitled-session labels and Flags cell, overview totals = chart, hook exit 0; project review | `82bf4ae`, `a71f679`, `d391dc6`, `038ff40` |
| 2026-10-15 | Context harness for agents working on this repo: AGENTS/CLAUDE, entry docs, orientation + context-guard hooks, rules, skills, subagents, pre-commit checks, `npm run verify` | `docs/harness.md` |
| 2026-10-15 | `/ccmeter` prints only the URL (`continue:false` + `stopReason`) | `ba88527` |
| 2026-10-14 | Usage guide; fixed colour per known model | `af427fd` |
| 2026-10-14 | Installed on the user's machine from this checkout; live hook and `/ccmeter` verified headlessly | `docs/ACCEPTANCE.md` |
| 2026-10-14 | Docs: architecture with M3 design, assumptions, README, acceptance; classifier-request counting | `63a8273` |
| 2026-10-14 | M2: dashboard, API, status line; zero-token `/ccmeter` hook | `1a184aa`, `af4c01b`, tag `m2` |
| 2026-10-14 | M1: parser, pricing, schema, recorder, CLI, plugin, tests, FORMATS.md | `baca029`…`dd19e16`, tag `m1` |
| 2026-10-14 | Scope and plan agreed | `docs/SCOPE.md` |
