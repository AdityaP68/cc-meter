# External formats agent-lens depends on

Everything here was observed, not assumed. Where something could not be verified it says so under **Not verified**.

- **Claude Code CLI on this machine:** `2.1.287` (`claude --version`, 2026-10-14).
- **Transcript versions surveyed:** `2.1.236` … `2.1.295` (17 distinct versions in the `version` field of entries). The Claude desktop app embeds its own Claude Code build, so transcripts can be *newer* than the CLI (`2.1.293`, `2.1.295` > `2.1.287`). agent-lens therefore selects the parser from the version recorded **in the transcript**, not from `claude --version`.
- **Corpus (at survey time):** 625 `.jsonl` files (590 top-level sessions, 35 subagent files), 57,611 lines, ≈ 180 MB; the largest single transcript is 46.6 MB. Entrypoints seen: `claude-desktop`, `sdk-cli` (`claude -p`), `cli`.
- **Docs read (2026-10-14):** `code.claude.com/docs/en/hooks`, `/statusline`, `/plugins-reference`, `/plugin-marketplaces`. The hooks page is 270k characters; only the first 100k (common input fields, configuration schema, plugin hook declaration, timeouts) were read. Payloads for the events agent-lens uses were **captured live** instead (below).

How these facts were gathered: throwaway scripts over `~/.claude/projects` (kept out of the repo), a live `claude -p` run with temporary capture hooks, and `claude plugin …` commands in an isolated `CLAUDE_CONFIG_DIR`.

---

## 1. Hook payloads (captured live, `claude -p`, 2.1.287)

Commands receive one JSON object on **stdin**.

`Stop`:
```json
{"session_id":"…","transcript_path":"/Users/…/.claude/projects/<proj>/<session_id>.jsonl","cwd":"…",
 "scratchpad_dir":"…","prompt_id":"…","permission_mode":"default","hook_event_name":"Stop",
 "stop_hook_active":false,"last_assistant_message":"ok","background_tasks":[],"session_crons":[]}
```
`SessionEnd`: same common fields, plus `"hook_event_name":"SessionEnd","reason":"other"` (docs list `clear`, `resume`, `logout`, `prompt_input_exit`, `other`). No `permission_mode`.
`SessionStart`: common fields plus `"source":"startup"`.

Consequences for agent-lens:
- `transcript_path` is the only field the recorder needs. **`last_assistant_message` contains reply text and is never read or stored** (a test asserts the DB does not contain it).
- `session_id` equals the transcript file's base name in every case observed.
- Docs: `transcript_path` "is written asynchronously and may lag the current turn", so a `Stop` hook can see a transcript missing its last entries. `SessionEnd` and the next `Stop` re-record the whole session (idempotent), which repairs this.
- `SessionEnd` hooks share a **1.5 s** budget unless a longer `timeout` is set (docs). Recording the largest transcript (46.6 MB, 13.5k lines) takes ≈ 0.2 s.
- Hooks run in parallel; `async: true` is supported on command hooks.
- **Observed in `-p` mode:** an `async` Stop hook was started, then logged as `Hook Stop (Stop) cancelled` because the process exits right after the turn. A synchronous SessionEnd hook always completed. So in headless runs SessionEnd is what records the session.

### Hook configuration (docs)
`{"hooks":{"<Event>":[{"matcher"?:"…","hooks":[{"type":"command","command":"…","timeout":<seconds>,"async"?:true}]}]}}`. Plugin hooks live in `hooks/hooks.json` with an outer `"hooks"` wrapper. `${CLAUDE_PLUGIN_ROOT}` is substituted in `command`/`args` and exported to the process; wrap it in double quotes in shell form (`claude plugin validate` warns otherwise).

## 2. statusLine (docs; **not captured live**: it only runs in interactive sessions)

Config: `"statusLine": {"type":"command","command":"…","padding"?:n,"refreshInterval"?:seconds}`. The command receives JSON on stdin and prints the status line on stdout. Fields used by agent-lens:

| field | meaning |
|---|---|
| `session_id`, `transcript_path` | which session |
| `model.id`, `model.display_name` | current model |
| `cost.total_cost_usd` | Claude Code's own estimate, **resets to $0 on `/clear`** |
| `context_window.total_input_tokens` / `total_output_tokens` | tokens **currently in the context window** from the latest response, *not* cumulative |
| `context_window.used_percentage` | may be `null` early in a session |

Because the stdin JSON has no cumulative token counts, `agent-lens statusline` reads cumulative tokens and cost from the transcript (cached by file size/mtime) and uses stdin only for the model name and as a fallback.

## 3. Plugins and marketplaces (docs + verified with the CLI)

- Plugin manifest: `.claude-plugin/plugin.json`, only `name` required. Other component dirs (`hooks/`, `commands/`, `skills/`) live at the plugin root, **not** inside `.claude-plugin/`. Names starting `claude-`/`anthropic-`/`cc-plugin-` are reserved.
- Marketplace: `.claude-plugin/marketplace.json` with `name`, `owner`, `plugins[]` (`name`, `source`). `source` is a path **from the marketplace root** (`./plugin`).
- `claude plugin validate <dir>` validates both. `claude plugin marketplace add <path>` accepts an **absolute path or `./relative`; `.` alone is rejected** ("Invalid marketplace source format"). Re-adding is a no-op. `claude plugin install <plugin>@<marketplace>` is idempotent and, for a local marketplace, "loads in place" from the repo (edits apply at next session / `/reload-plugins`). `claude plugin uninstall`, `claude plugin marketplace remove` exist.
- `claude plugin details <plugin>` prints a component inventory and "Always-on" token cost. Measured for agent-lens: hooks are "harness-only — no model context cost"; **a skill costs ≈ 20–39 tokens (20 for `convo-review`, re-measured 2026-10-19; 39 for the earlier longer stub) in every session even with `disable-model-invocation: true`**, which is why the M3 skill is shipped as `SKILL.md.stub` until it exists.
- `bin/` executables are on PATH only for the **Bash tool**, not for hooks. Hooks therefore go through `plugin/scripts/agent-lens.sh`, which finds the CLI via `agent-lens` on PATH or `~/.agent-lens/cli-path`.
- `--plugin-dir <dir>` loads a plugin for one run without installing (used for the live end-to-end test).

## 4. Transcript layout

```
~/.claude/projects/<cwd with "/" replaced by "-">/<session_id>.jsonl                 main thread
~/.claude/projects/<…>/<session_id>/subagents/agent-<agentId>.jsonl                  one file per subagent
~/.claude/projects/<…>/<session_id>/subagents/agent-<agentId>.meta.json              sidecar (agentType, description, model, parentAgentId, spawnDepth, …); agent-lens ignores it
```
Honours `CLAUDE_CONFIG_DIR`. In all 590 top-level files every entry's `sessionId` equals the file name; no message id appears in two top-level files (resumed sessions do not duplicate history across files). Subagent entries have `isSidechain: true` and an `agentId`, and **appear only in the subagent files, never in the main file**.

**Do not parse with `readline`.** It splits on U+2028/U+2029 as well as `\n`; real transcripts contain those characters unescaped inside JSON strings, so `readline` produced 112 false "unparsable" lines in a 57k-line corpus. agent-lens splits on `\n` only (regression test included).

### Entry types (top-level `type`; counts over the corpus)
Read by agent-lens: `assistant` (14,978), `user` (9,037), `system` (368), `cost-state` (538).
Known and ignored (counted, not "unknown"): `attachment` 18,545 · `atis-latch` 3,198 · `last-prompt` 3,191 · `queue-operation` 2,130 · `custom-title` 1,416 · `mode` 1,036 · `agent-name` 898 · `ai-title` 744 · `bridge-session` 623 · `file-history-delta` 336 · `artifact-autoreact-ledger` 203 · `frame-link` 166 · `file-history-snapshot` 132 · `artifact-comment-monitor` 18 · `permission-mode` 5.
`system` subtypes seen: `stop_hook_summary` 339, `api_error` 16, `compact_boundary` 7, `turn_duration` 3, `local_command` 2, `away_summary` 1. `attachment` has ~40 subtypes (system-prompt snapshots, tool lists, hook results, …); none carry billable usage.
Any other `type` is counted in `parse_stats.unknownTypes` and shown by `agent-lens doctor`.

### Assistant entry
```
{ parentUuid, isSidechain, type:"assistant", uuid, timestamp, sessionId, version, cwd, gitBranch, entrypoint,
  requestId, agentId?, apiBlockIndex?, effort?, advisorModel?, requestedModel?, slug?, …,
  message: { id:"msg_…", model, role, type, content:[…], stop_reason, stop_sequence, stop_details,
             usage:{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens,
                     cache_creation:{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens},
                     server_tool_use:{web_search_requests, web_fetch_requests}, service_tier, speed?, inference_geo,
                     output_tokens_details?, iterations?, fallback_credit? } } }
```
All 12 `usage` keys above are known to the parser; any other key is counted as `unknownUsageKeys` (a new billable token class would surface in `doctor`).

- **Streaming duplicates.** One transcript line is written per content block, all with the same `message.id` (7,437 repeated ids in 14,978 entries). Usage can be a partial snapshot on earlier copies (`output_tokens` 16 → 272 in an observed pair). In 5,102 duplicate groups the **last** copy always had the maximum `output_tokens`, so agent-lens keeps the last copy per id.
- **Synthetic messages.** 252 entries with `model: "<synthetic>"`, `isApiErrorMessage: true`, `stop_reason: "stop_sequence"`: API errors rendered as messages. Ignored.
- **Model ids** are seen both dated and undated: `claude-opus-5-5`, `claude-opus-5`, `claude-sonnet-5-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`. `claude-opus-5` and `claude-opus-5-5` are different models (Opus 5 vs 5.5), not aliases.
- **`stop_reason: null`** on the final copy of a message means an unfinalized streaming snapshot (see Known discrepancies).
- `speed` was `"standard"` or absent in all data; `"fast"` (fast mode) was never observed.

### User entry and the definition of a "turn"
Observed shapes (counts): `tool_result` array 7,905 (not prompts) · string with `promptSource: sdk` 827 · `isMeta` entries ≈ 170 (local-command caveats, injected reminders) · `<task-notification>` / `promptSource: system` 102 · slash commands `<command-name>…` 30 · `isCompactSummary` 7 · `text`-block arrays 47 · typed prompts 2.
agent-lens counts a **turn** as a non-sidechain `user` entry that is not `isMeta`, not `isCompactSummary`, not `promptSource: "system"`, and whose content is a non-empty string not starting with a harness tag (`<command-name>`, `<local-command`, `<task-notification`, `<system-reminder`, …) or an array containing a `text` block. Subagent messages are assigned to the turn their timestamp falls in.

### Tool blocks (`tool_use`, `tool_result`, `toolDenialKind`)
Observed 2026-10-19 on fixtures from five Claude Code versions and, as counts only, on the local corpus (631 transcripts, Claude Code up to 2.1.302). Read by `core/parser/cc21-detail.ts` for the reviewer's digest; no tool output or input value is kept.
- Assistant `content` holds `{type:"tool_use", id, name, input, caller}` blocks. Names seen most: `Bash`, `Read`, `Write`, `Grep`, `Edit`, `Glob`, `ToolSearch`, `WebFetch`, `Skill`, `WebSearch`, `Agent` (the subagent launcher), `AskUserQuestion`, `SendMessage`, and `mcp__<server>__<tool>`. `Task` (an older name for `Agent`) was not observed and is treated as a subagent launcher without evidence.
- A later non-prompt `user` entry holds `{type:"tool_result", tool_use_id, content, is_error?}`. Of 7,435 results: `is_error: true` 349, `false` 4,212, key absent 2,874, so **absent means not an error**, not unknown.
- A user entry can carry a top-level `toolDenialKind`; values seen with counts: `permission-rule` 160, `automode-unavailable` 7, `automode-blocked` 3, `interrupted` 1, `user-rejected` 1. What each means is **not verified**; agent-lens only counts them by kind.
- Subagent tool calls are in the subagent files, not the main file; the digest counts only main-thread tool blocks plus the `Agent` launches among them.

### `claude -p --output-format json --json-schema` result (Claude Code 2.1.302)
Observed 2026-10-19 in one paid probe (Haiku 5.5, ~$0.0003, `--tools ""`, `--no-session-persistence`, agent-lens plugin disabled). One JSON object on stdout: `type:"result"`, `subtype:"success"`, `is_error`, `result` (the JSON as a string), **`structured_output`** (the parsed object, present because of `--json-schema`), `session_id`, `total_cost_usd`, `usage` (same keys as a transcript's `usage`), `modelUsage` (per model, like `cost-state`), `num_turns` (2: the structured answer is a tool call), `terminal_reason:"completed"`. The schema keyword `additionalProperties:false` was accepted; `minimum`/`maximum`/`maxLength` were **not tried**, so the reviewer's schema leaves them out and validates ranges itself. The trivial prompt cost 1,491 cache-creation tokens (1-hour TTL) with a one-line system prompt and tools off: that is the fixed overhead `core/judge.ts` adds to its estimate. A failed run (not logged in) is `is_error:true` with the message in `result` and exit code 1 (observed 2026-10-18, `docs/memory/lessons.md`). **Observed 2026-10-19 on a real review** (Sonnet 5.5, a 2-turn session): the persisted judge run's transcript lands under `<CLAUDE_CONFIG_DIR>/projects/<judge cwd>/<session_id>.jsonl` like any session, was recorded as `agent-lens-judge`, and agent-lens's derived cost equals `total_cost_usd` exactly ($0.017844; 3,275 cache-creation + 2 input + 474 output tokens).

### Session titles (`custom-title`, `ai-title`)
Surveyed 2026-10-15 over 613 top-level transcripts (2.1.236 … 2.1.295), aggregates only:
| Entry | Entries | Sessions | Keys (all entries) |
|---|---|---|---|
| `custom-title` | 1,497 | 7 | `type`, `customTitle`, `sessionId` |
| `ai-title` | 744 | 21 | `type`, `aiTitle`, `sessionId` |

Both are re-emitted many times per session; the last one wins, and `customTitle` beats `aiTitle`. No title is carried under any
other key, no `summary` entry exists, and `<session>/custom-title.json` only mirrors `custom-title` entries.
**Most sessions have no title (586 of 613)**, and the parser is not at fault. 516 of them are `sdk-cli` (`claude -p`, 515 with a single turn):
no `sdk-cli` session on 2.1.264 or later has an `ai-title` (0 of 514). Interactive sessions on ≥ 2.1.280 rarely get one (1 of 36);
titled interactive sessions are the long or renamed ones. agent-lens therefore shows a content-free fallback label for untitled
sessions: entry point + main model + turn count (`core/aggregate.ts` `sessionLabel`), never prompt text.
Not verified: what triggers `ai-title` in current versions.

### Compaction
`{"type":"system","subtype":"compact_boundary","timestamp":…,"compactMetadata":{"trigger":"manual"|"auto","preTokens":799627,"postTokens":16951,"durationMs":…,"preservedSegment":{…},…}}`, followed by a `user` entry with `isCompactSummary: true`. The compaction summarisation call itself is **not** an assistant entry (see discrepancies).

### `cost-state` entry (Claude Code's own accounting)
```
{"type":"cost-state","sessionId":…,"totalCostUSD":0.020972,"totalAPIDuration":…,"totalDuration":…,
 "modelUsage":{"<model>":{"inputTokens","outputTokens","thinkingTokens","cacheReadInputTokens","cacheCreationInputTokens","webSearchRequests","costUSD"}},
 "hasUnknownModelCost":false}
```
Several per file (snapshots); the last one wins. 538 entries in 521 sessions. Presence is **not predictable from the version**: found in files of 2.1.247, .281, .286, .287 and .295 (e.g. 429 of 430 files of 2.1.287), absent in all 62 files of 2.1.263 and in the few files of .236/.288/.289/.293. agent-lens treats absence as normal. agent-lens uses it **only as an oracle** for cross-checks (`agent-lens report --session`, `doctor`).

## 5. Pricing facts (verified against `cost-state`)

`agent-lens doctor --verify-pricing` feeds Claude Code's own token counts through `pricing.json` and compares with Claude Code's own `costUSD`:

| model | in $/MTok | out | cache read | 5m write | 1h write | status |
|---|---|---|---|---|---|---|
| claude-sonnet-5-5 | 2 | 10 | 0.20 | 2.50 | 4 | exact on 297 sessions (error < $0.00001) |
| claude-haiku-4-5 | 1 | 5 | 0.10 | 1.25 | 2 | exact on 3 sessions |
| claude-opus-5-5 | 4 | 20 | 0.20 | 5 | 8 | reproduces CC to the cent for both an all-1h session ($4.807677) and an all-5m session ($33.1488) |
| claude-opus-5, others | list price | | | | | **list only, not verified** (1 in-range Opus 5 session) |

- Claude Code bills **the main thread's cache writes at the 1h tier and subagents' at 5m** (observed). cost-state does not split writes by TTL, so the verification checks the cost falls inside the 5m…1h range.
- `webSearchPerRequest` ($0.01), fast-mode ×2 and Haiku 5.5 long-context rates come from published list prices and were **never exercised** in this corpus.

---

## Known discrepancies between agent-lens and Claude Code's own totals

Token totals equal Claude Code's `cost-state` exactly for most sessions, but not all. Each cause below is classified.

1. **Subagent output tokens are a lower bound — verified.** In subagent transcripts, 1,179 of 1,492 final message entries (79 %) have `stop_reason: null`, i.e. an unfinalized snapshot averaging ≈ 9 output tokens; in main transcripts 0 of 5,835 do. Evidence in session `74ac81b4`: its Opus tokens come entirely from subagents; input, cache-write and cache-read match Claude Code to the token while output is 83,229 (transcript) vs 658,866 (Claude Code). The tokens cannot be recovered from the transcript, so agent-lens flags `partial_messages` per session and shows Claude Code's figure next to its own.

   Cause and prevention, investigated 2026-10-15 (read-only; aggregates over 38 subagent files in 3 parent sessions, 35 of them one session; Claude Code 2.1.286–2.1.295; 1,514 final messages, re-checked independently at 1,550 with 1,234 null):
   - **Observed.** 79 % of subagent final messages are null (2.1.286 76 %, .288 85 %, .289 76 %, .293 87 %; .295 22 of 22 but those files were live). **Still occurring on the newest versions; no version boundary.** Main transcripts: 0 of 6,690 in all 17 versions and all three entry points.
   - **Observed: it is not an end-of-file artifact.** Only 35 of ~1,200 null messages are the file's last assistant message; the rest sit mid-file, all followed by their `tool_result` and later assistant turns. So it is not an abort, interrupt, or killed session. Parent and subagent show no interrupt/abort/cancel keys. The parent session continued after 33 of 33 ended subagents; completion notifications arrived about 0.1 s after the last entry.
   - **Observed: it depends on the tool in the message's last content block.** Null / total: `Bash` 97 % (1,167 of 1,189), `Agent` 11 of 11, `Monitor` 5 of 5, `SubagentHandback` 34 of 34; `Read` 3 of 104, `Edit` 0 of 33, `Write` 12 of 168. Not tied to model (opus 85 %, sonnet 76 %), subagent type, background vs foreground, or spawn depth. Subagent files contain no `end_turn`; subagents end by a `SubagentHandback` tool call, so the final message is almost always null.
   - **Observed mechanism of the transcript.** A message has one entry per content block. Finalized messages have a later copy carrying `stop_reason` (`tool_use`) and the real `output_tokens` (median 1,820), plus `usage.iterations`, `output_tokens_details`, `server_tool_use`, `speed`, `fallback_credit`. Null messages keep only the `message_start` usage (`output_tokens` median 8, 97.7 % ≤ 30), and no copy ever differs in tokens. Input, cache-read and cache-write look normal; only output is affected. In main transcripts every copy already carries the final value.
   - **Entry point.** Only `claude-desktop` subagents exist in this corpus (no `cli` or `sdk-cli` subagent files), and none from versions before 2.1.286, so neither can be compared.
   - **Hypothesis (not verified).** The subagent transcript writer writes the `message_delta` patch (stop reason, final usage) onto the last block's entry, and for tools such as `Bash` that patch is never written, possibly because the tool starts executing as soon as the block ends. The evidence is the tool-name correlation alone; Claude Code's source or a live stream trace would be needed.
   - **Preventable?** Not by the user or agent-lens, as far as observed: it needs no abort, and no setting, flag or entry point that avoids it was found (none was tested; running subagents from `cli` or `sdk-cli` would need a paid experiment). The real output tokens of null messages are unknown; Claude Code's `cost-state` has them. An exact source would be OTel `api_request` events (see below, unverified).
2. **Claude Code bills more input/cache than the transcript shows in interactive sessions with server-side classifier calls — strongly associated, mechanism not proven.** Every assistant entry may carry `serverClassifierRequest` (a request id string). Across the 310 sessions that have a `cost-state` entry:
   - 306 sessions where agent-lens's tokens equal Claude Code's exactly: the field appears on 2 of 1,388 assistant entries (0.1 %);
   - 4 sessions that differ: it appears on 4,944 of 8,616 entries (57 %), and on 100 % of entries in three of the four. The differences have the signature of extra calls with large cached input and tiny output (e.g. `ea5ca058`: +10.6k input, +2.3M cache-read, +730 output).
   - Confound: all four are interactive `claude-desktop` sessions, nearly all matching sessions are headless `sdk-cli` runs, so the data cannot separate "classifier calls" from "interactive desktop". Treat as the leading hypothesis (the debug log of a `-p` run mentions an auto-mode gate, i.e. a permission classifier exists), not a fact.
   - Practical effect: agent-lens's cost is a lower bound for such sessions. agent-lens counts the entries (`parse_stats.classifierRequests`) and shows Claude Code's own total next to its own.
   - 2026-10-15 (Claude Code 2.1.281–2.1.295, 382 recorded sessions, 316 with `cost-state`): 308 match exactly; in **7**, Claude Code's per-model tokens are ≥ agent-lens's in every class (so its record covers the whole transcript) and its total is **$32.28 higher** (per session $0.03–$29.66); 1 covers less (item 3). All 7 are `claude-desktop`, all carry `serverClassifierRequest`; the 10 matching desktop sessions have 1 message each, so the confound above still stands. One of the 7 has a whole model (`haiku-5-5`, 38k in / 3k out) that never appears in the transcript. Several show the same +2,024 input tokens per model. An estimate "calls not in the transcript ≈ Claude Code minus agent-lens" is therefore possible exactly where every class is ≥; the dashboard shows it there (`core/reconcile.ts` `hiddenCallsEstimate`), leaving out output deltas in sessions with partial messages (item 1). 2026-10-15, user's data: 10 sessions, ≈ $10.32; the largest raw gap ($29.70) is mostly 1.70M output tokens from mid-stream replies, so its estimate is $6.95.
3. **`cost-state` covers less than the transcript in sessions that span several Claude Code processes — observed.** Two of the four mismatching sessions go the other way (agent-lens higher): one is +44.6 % and one is 42 days long with agent-lens at $719 against Claude Code's $42.76. In the latter, `cost-state`'s per-model totals for the main model stay frozen far below what the transcript's own messages sum to, so `cost-state` evidently restarts or restores only part of the history when a session is resumed or spans process lifetimes. (Claude Code's docs say its statusLine `cost.total_cost_usd` also resets on `/clear`.) The transcript messages are real API responses, so in these sessions the transcript-derived figure is the more complete one.

   - 2026-10-15, same session, per model: `claude-opus-5` agent-lens $676.12 against Claude Code $4.69 (the last `cost-state` entry, written after a later resume, covers even less). It is 60 % of all recorded spend, so `doctor` now names the largest difference.
4. **Transcripts with no API call — observed 2026-10-15 (Claude Code ≤ 2.1.295).** 236 transcripts contained only `<synthetic>` assistant entries; 231 of them have a `cost-state` entry and every one has `totalCostUSD` 0 (entry points: `sdk-cli` 215, `claude-desktop` 16, `cli` 5). The recorder skips them; `doctor` counts them as "no API calls", not as unrecorded.

So a difference in either direction is **information, not necessarily an error**: agent-lens prints both numbers and never silently picks Claude Code's.

Measured on this corpus: 306 of 310 sessions with a `cost-state` entry match Claude Code's per-model token totals exactly (all four differing sessions are interactive desktop sessions). `agent-lens doctor` prints the live count; `docs/ACCEPTANCE.md` describes how to reproduce it.

## OpenTelemetry export (docs read 2026-10-15; **observed once 2026-10-18**, Claude Code 2.1.302, `claude -p`)
**Observed (paid, ~$0.0074, Haiku 5.5, one Bash call and one subagent, loopback `http/json` receiver, isolated config).** The exporter POSTed 7 batches to `/v1/logs` (`OTEL_LOGS_EXPORT_INTERVAL=1000` honoured). Events seen: `managed_settings_resolved`, `plugin_loaded`, `mcp_server_connection`, `user_prompt`, `tool_decision`, `tool_result`, `api_request`, `assistant_response`, `subagent_completed`, `internal_error`, `retention_sweep`. Prompt and reply text arrive as `<REDACTED>` by default (only lengths). `api_request` attributes: `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `cache_creation_5m_tokens`, `cache_creation_1h_tokens`, `cost_usd`, `cost_usd_micros`, `duration_ms`, `ttft_ms`, `request_id`, `client_request_id`, `speed`, `query_source` (`sdk` for the main thread, `agent:builtin:general-purpose` for the subagent), `effort`, `agent.name` (subagent only), plus `session.id`, `prompt.id`, `event.sequence`.
**Result: exact agreement.** The 4 `api_request` events match the 4 transcript messages (1 sidechain) one for one on input, output, cache-read, cache-write and the 5m/1h split, and `cost_usd` equals agent-lens's per-message cost to the printed precision. Sums (input 8, output 248, cache-write 41,793, cache-read 91,688, $0.007371155) equal agent-lens, `cost-state` `modelUsage` and the `claude -p --output-format json` `total_cost_usd`. So for this run the transcript lost nothing and agent-lens's Haiku 5.5 price table reproduces Claude Code's own cost exactly.
**Not shown by this run:** it was non-interactive and had no classifier or other hidden call, so OTel and the transcript had the same 4 calls; whether OTel sees the interactive-only extra calls (the gap above) is still open. One `internal_error` (`ENOENT`) event had no detail. Docs summary follows.

`code.claude.com/docs/en/monitoring-usage` (first 100k of 153k characters): `CLAUDE_CODE_ENABLE_TELEMETRY=1`; `OTEL_LOGS_EXPORTER` = `console`/`otlp`/`none` (no file exporter); OTLP protocols `grpc`, `http/json`, `http/protobuf`, endpoint e.g. `http://localhost:4317`; logs flush every `OTEL_LOGS_EXPORT_INTERVAL` (5 s). Event `claude_code.api_request` per API call: `session.id`, `prompt.id`, `model`, `cost_usd`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `duration_ms`, `request_id`, `query_source` (e.g. `repl_main_thread`, `compact`, a subagent name), no prompt text unless `OTEL_LOG_USER_PROMPTS=1`. Settable in `~/.claude/settings.json` `env`; ignored in a repository's `.claude/settings*.json`. So a 127.0.0.1 `http/json` receiver could count every billed call, including ones absent from the transcript. Still unverified (needs an interactive session): whether classifier calls emit `api_request`, what `query_source` they carry, and whether the desktop app's Code tab honours the user's `settings.json` `env`.

## Not verified

- Live `statusLine` stdin payload (docs only). Interactive (non-`-p`) behaviour of the async `Stop` hook.
- What `advisorModel` (present on ~40 % of assistant entries) bills as, and whether advisor calls appear in `usage`.
- Fast mode, web search billing, long-context surcharges, `claude-opus-5` and other list-only prices.
- Behaviour of `/clear`, `--resume` and `--fork-session` on session files beyond "no duplicated message ids across files, file name = session id".
- Transcript format of Claude Code < 2.1.236 or ≥ 2.2: no parser is claimed for them; `doctor` warns.
