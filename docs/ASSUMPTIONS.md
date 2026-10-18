# Assumptions and decisions made without asking

You asked me to take the best assumptions and build. These are the ones that could matter. Each says what to change if you disagree.

## About the request itself

1. **"The complaint parameter" and "our custom harness approach" could not be found at first.** *Update 2026-10-15:* the harness approach is the user's Context Harness method (`~/Documents/context-harness/docs/guides/`), now applied to this repository (`docs/harness.md`). "The complaint parameter" is still unresolved. I searched this project's memory (empty), the other Claude Code sessions' transcripts on this machine, and `~/.claude/plans`. The only mention of either phrase is your last message in this conversation. I did **not** invent a meaning. What I did instead:
   - Reused the working style visible in your earlier diagram-mcp plan (`~/.claude/plans/keen-launching-turing.md`): verified facts written down before code (`docs/FORMATS.md` plays the ADR-0001 role), exact-pinned dev dependencies, `ignore-scripts=true`, small commits, one tag per milestone, no push.
   - Reserved a slot for a "complaint" detector in the M3 heuristics design (`docs/ARCHITECTURE.md` §2). It is design text only; no code exists for it. **If you meant something specific, tell me what it is** (a CLI flag? a rubric dimension? a signal?) and I'll build to it.
2. **I built M1 and M2 and designed M3**, as the brief describes, and stopped there. Nothing about M3 beyond the design doc and the `agent-lens review` stub exists.
3. **I did not install anything into your real `~/.claude` or `~/.agent-lens`.** All tests, the end-to-end hook test and the clone-and-install test used isolated `CLAUDE_CONFIG_DIR` / `AGENT_LENS_HOME`. One live `claude -p` run per experiment wrote an ordinary (tiny) transcript into `~/.claude/projects`, as any run does. Running `./install.sh` yourself is the first time agent-lens touches your real setup.

## Technical choices

| Decision | Why | To change |
|---|---|---|
| `node:sqlite`, Node ≥ 22.13 | no native build step; zero runtime dependencies; clone→dashboard stays fast | swap `core/db.ts` for `better-sqlite3` (same SQL) |
| A repo-local git identity was set (not global) | git had none configured and commits need one | `git config user.name` / `user.email`; rewrite authorship before publishing if you want a different one |
| Dashboard on `127.0.0.1:7337` (falls back to the next free port), auto-exits after 4 h idle | predictable URL; no zombie server | `~/.agent-lens/config.json`: `port`, `idleMinutes` |
| `/agent-lens` implemented as a `UserPromptSubmit` hook, plus a fallback command | a plain slash command costs a model turn that re-reads the whole context | delete the hook, or the command file |
| `Stop` hook is `async` | keeps turns snappy; `SessionEnd` + the server's 30 s rescan are the guarantee | remove `"async": true` in `plugin/hooks/hooks.json` |
| The M3 skill `convo-review` ships as `SKILL.md` (2026-10-19) | the feature exists; measured ≈ 20 tokens always-on (the earlier stub measured ≈ 39 with a longer description); `check.mjs` keeps it a thin wrapper | rename it to `SKILL.md.stub` to go back to zero footprint |
| A **turn** = a real human prompt (definition in `docs/FORMATS.md`) | tool results, meta entries, slash-command echoes and compaction summaries are not prompts | `isRealPrompt` in `core/parser/cc21.ts` |
| Subagent usage is part of the session's totals, tagged `sidechain` | Claude Code's own accounting includes it; verified on a real session | – |
| Status line reads cumulative tokens/cost from the transcript, not from stdin | stdin only has *current-context* tokens | `cli/commands/statusline.ts` |
| The status line is **not** enabled automatically | it edits your `~/.claude/settings.json` | `agent-lens setup --statusline` (backs the file up) |
| Day buckets use the machine's local time zone | matches how you experience "today" | `core/aggregate.ts` |
| Titles and working directories are stored (in `~/.agent-lens`) | needed to make the dashboard readable | never stored: any prompt/reply/tool text |

## Prices
`pricing.json` entries marked `"basis": "list"` (Opus 5, Sonnet 5, Fable, Opus 4.x, Sonnet 4.6, Haiku 5.5, fast-mode ×2, web search $0.01, Haiku 5.5 long-context) come from published list prices and were never compared with a Claude Code cost. `"verified"` entries (Sonnet 5.5, Haiku 4.5, Opus 5.5) reproduce Claude Code's own `costUSD` (see `agent-lens doctor --verify-pricing`). Models not in the table are shown as **unpriced**, never $0.

## Things I could not verify
Listed at the end of `docs/FORMATS.md` ("Not verified"): the live statusLine payload, the async Stop hook in an interactive session, `/agent-lens` behaviour in an interactive session (it was verified headlessly), what `advisorModel` bills as, fast mode, web search billing.

## Milestone 3 reviewer (2026-10-19): choices made without asking

| Decision | Why | To change |
|---|---|---|
| Prompts cut to 500 characters; 80 prompts max (first 20 and last 60) | bounds the text that leaves the machine and the cost; the judge still sees every turn's numbers | `DEFAULT_*` in `core/digest.ts` (changes the digest hash, so cached reviews no longer match) |
| Correction phrases exactly as the design table lists them (starts with "no,", or contains "that's wrong", "I said", "undo", "revert") plus optional `extraPhrases` per config | no invented definition; `complaint` stays unbuilt | `detectors.user_corrections.extraPhrases` in config.json |
| "Retry loop" = identical tool and input (whitespace-normalised) at least 3 times in one turn | the only repeat signal observable without storing inputs | `detectors.retry_loops.minRepeats` |
| `Task` counted as a subagent launcher next to `Agent` | older name; **not observed**, harmless if absent | `SUBAGENT_TOOLS` in `core/parser/cc21-detail.ts` |
| Default judge `claude-sonnet-5-5`; spend cap = 4x the estimate (min $0.25) | design says Sonnet-class; the cap stops a runaway, not a normal run | `review.model` in config.json, `--model` |
| Estimate = characters / 3.5 + 1,500 fixed tokens, priced as a 1-hour cache write | the one probe showed the whole prompt billed as cache creation; compared with one real review 2026-10-19: ran 10 % low on cost (the fixed overhead was larger than 1,500 tokens), so it does not lean high after all | `estimateReview` in `core/judge.ts` |
| Judge runs are persisted by Claude Code (not `--no-session-persistence`) | the design records them as tagged sessions; the cost is a redacted copy of the digest in `~/.claude/projects` | add the flag and record overhead from the JSON result only |
| Cost fields are left out of `digest_hash` | a price-table update must not trigger a new paid review | `digestHash` in `core/digest.ts` |
| The judge schema omits `minimum`/`maximum`/`maxLength` | unprobed keywords might be rejected; ranges are validated in code | `REVIEW_SCHEMA` (bump `RUBRIC_VERSION`) |

