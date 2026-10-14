# Assumptions and decisions made without asking

You asked me to take the best assumptions and build. These are the ones that could matter. Each says what to change if you disagree.

## About the request itself

1. **"The complaint parameter" and "our custom harness approach" could not be found.** I searched this project's memory (empty), the other Claude Code sessions' transcripts on this machine, and `~/.claude/plans`. The only mention of either phrase is your last message in this conversation. I did **not** invent a meaning. What I did instead:
   - Reused the working style visible in your earlier diagram-mcp plan (`~/.claude/plans/keen-launching-turing.md`): verified facts written down before code (`docs/FORMATS.md` plays the ADR-0001 role), exact-pinned dev dependencies, `ignore-scripts=true`, small commits, one tag per milestone, no push.
   - Reserved a slot for a "complaint" detector in the M3 heuristics design (`docs/ARCHITECTURE.md` §2). It is design text only; no code exists for it. **If you meant something specific, tell me what it is** (a CLI flag? a rubric dimension? a signal?) and I'll build to it.
2. **I built M1 and M2 and designed M3**, as the brief describes, and stopped there. Nothing about M3 beyond the design doc and the `ccmeter review` stub exists.
3. **I did not install anything into your real `~/.claude` or `~/.ccmeter`.** All tests, the end-to-end hook test and the clone-and-install test used isolated `CLAUDE_CONFIG_DIR` / `CCMETER_HOME`. One live `claude -p` run per experiment wrote an ordinary (tiny) transcript into `~/.claude/projects`, as any run does. Running `./install.sh` yourself is the first time ccmeter touches your real setup.

## Technical choices

| Decision | Why | To change |
|---|---|---|
| `node:sqlite`, Node ≥ 22.13 | no native build step; zero runtime dependencies; clone→dashboard stays fast | swap `core/db.ts` for `better-sqlite3` (same SQL) |
| A repo-local git identity was set (not global) | git had none configured and commits need one | `git config user.name` / `user.email`; rewrite authorship before publishing if you want a different one |
| Dashboard on `127.0.0.1:7337` (falls back to the next free port), auto-exits after 4 h idle | predictable URL; no zombie server | `~/.ccmeter/config.json`: `port`, `idleMinutes` |
| `/ccmeter` implemented as a `UserPromptSubmit` hook, plus a fallback command | a plain slash command costs a model turn that re-reads the whole context | delete the hook, or the command file |
| `Stop` hook is `async` | keeps turns snappy; `SessionEnd` + the server's 30 s rescan are the guarantee | remove `"async": true` in `plugin/hooks/hooks.json` |
| The M3 skill ships as `SKILL.md.stub` | a loaded skill costs ≈ 39 tokens in every session even when model-invocation is disabled | rename it to `SKILL.md` when M3 ships |
| A **turn** = a real human prompt (definition in `docs/FORMATS.md`) | tool results, meta entries, slash-command echoes and compaction summaries are not prompts | `isRealPrompt` in `core/parser/cc21.ts` |
| Subagent usage is part of the session's totals, tagged `sidechain` | Claude Code's own accounting includes it; verified on a real session | – |
| Status line reads cumulative tokens/cost from the transcript, not from stdin | stdin only has *current-context* tokens | `cli/commands/statusline.ts` |
| The status line is **not** enabled automatically | it edits your `~/.claude/settings.json` | `ccmeter setup --statusline` (backs the file up) |
| Day buckets use the machine's local time zone | matches how you experience "today" | `core/aggregate.ts` |
| Titles and working directories are stored (in `~/.ccmeter`) | needed to make the dashboard readable | never stored: any prompt/reply/tool text |

## Prices
`pricing.json` entries marked `"basis": "list"` (Opus 5, Sonnet 5, Fable, Opus 4.x, Sonnet 4.6, Haiku 5.5, fast-mode ×2, web search $0.01, Haiku 5.5 long-context) come from published list prices and were never compared with a Claude Code cost. `"verified"` entries (Sonnet 5.5, Haiku 4.5, Opus 5.5) reproduce Claude Code's own `costUSD` (see `ccmeter doctor --verify-pricing`). Models not in the table are shown as **unpriced**, never $0.

## Things I could not verify
Listed at the end of `docs/FORMATS.md` ("Not verified"): the live statusLine payload, the async Stop hook in an interactive session, `/ccmeter` behaviour in an interactive session (it was verified headlessly), what `advisorModel` bills as, fast mode, web search billing.
