# External formats ccmeter depends on

Everything here was observed, not assumed. Where something could not be verified it says so under **Not verified**.

- **Claude Code CLI on this machine:** `2.1.287` (`claude --version`, 2026-10-14).
- **Transcript versions surveyed:** `2.1.236` … `2.1.295` (17 distinct versions in the `version` field of entries). The Claude desktop app embeds its own Claude Code build, so transcripts can be *newer* than the CLI (`2.1.293`, `2.1.295` > `2.1.287`). ccmeter therefore selects the parser from the version recorded **in the transcript**, not from `claude --version`.
- **Corpus (at survey time):** 625 `.jsonl` files (590 top-level sessions, 35 subagent files), 57,611 lines, ≈ 180 MB; the largest single transcript is 46.6 MB. Entrypoints seen: `claude-desktop`, `sdk-cli` (`claude -p`), `cli`.
- **Docs read (2026-10-14):** `code.claude.com/docs/en/hooks`, `/statusline`, `/plugins-reference`, `/plugin-marketplaces`. The hooks page is 270k characters; only the first 100k (common input fields, configuration schema, plugin hook declaration, timeouts) were read. Payloads for the events ccmeter uses were **captured live** instead (below).

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

Consequences for ccmeter:
- `transcript_path` is the only field the recorder needs. **`last_assistant_message` contains reply text and is never read or stored** (a test asserts the DB does not contain it).
- `session_id` equals the transcript file's base name in every case observed.
- Docs: `transcript_path` "is written asynchronously and may lag the current turn", so a `Stop` hook can see a transcript missing its last entries. `SessionEnd` and the next `Stop` re-record the whole session (idempotent), which repairs this.
- `SessionEnd` hooks share a **1.5 s** budget unless a longer `timeout` is set (docs). Recording the largest transcript (46.6 MB, 13.5k lines) takes ≈ 0.2 s.
- Hooks run in parallel; `async: true` is supported on command hooks.
- **Observed in `-p` mode:** an `async` Stop hook was started, then logged as `Hook Stop (Stop) cancelled` because the process exits right after the turn. A synchronous SessionEnd hook always completed. So in headless runs SessionEnd is what records the session.

### Hook configuration (docs)
`{"hooks":{"<Event>":[{"matcher"?:"…","hooks":[{"type":"command","command":"…","timeout":<seconds>,"async"?:true}]}]}}`. Plugin hooks live in `hooks/hooks.json` with an outer `"hooks"` wrapper. `${CLAUDE_PLUGIN_ROOT}` is substituted in `command`/`args` and exported to the process; wrap it in double quotes in shell form (`claude plugin validate` warns otherwise).

## 2. statusLine (docs; **not captured live**: it only runs in interactive sessions)

Config: `"statusLine": {"type":"command","command":"…","padding"?:n,"refreshInterval"?:seconds}`. The command receives JSON on stdin and prints the status line on stdout. Fields used by ccmeter:

| field | meaning |
|---|---|
| `session_id`, `transcript_path` | which session |
| `model.id`, `model.display_name` | current model |
| `cost.total_cost_usd` | Claude Code's own estimate, **resets to $0 on `/clear`** |
| `context_window.total_input_tokens` / `total_output_tokens` | tokens **currently in the context window** from the latest response, *not* cumulative |
| `context_window.used_percentage` | may be `null` early in a session |

Because the stdin JSON has no cumulative token counts, `ccmeter statusline` reads cumulative tokens and cost from the transcript (cached by file size/mtime) and uses stdin only for the model name and as a fallback.

## 3. Plugins and marketplaces (docs + verified with the CLI)

- Plugin manifest: `.claude-plugin/plugin.json`, only `name` required. Other component dirs (`hooks/`, `commands/`, `skills/`) live at the plugin root, **not** inside `.claude-plugin/`. Names starting `claude-`/`anthropic-`/`cc-plugin-` are reserved.
- Marketplace: `.claude-plugin/marketplace.json` with `name`, `owner`, `plugins[]` (`name`, `source`). `source` is a path **from the marketplace root** (`./plugin`).
- `claude plugin validate <dir>` validates both. `claude plugin marketplace add <path>` accepts an **absolute path or `./relative`; `.` alone is rejected** ("Invalid marketplace source format"). Re-adding is a no-op. `claude plugin install <plugin>@<marketplace>` is idempotent and, for a local marketplace, "loads in place" from the repo (edits apply at next session / `/reload-plugins`). `claude plugin uninstall`, `claude plugin marketplace remove` exist.
- `claude plugin details <plugin>` prints a component inventory and "Always-on" token cost. Measured for ccmeter: hooks are "harness-only — no model context cost"; **a skill costs ≈ 39 tokens in every session even with `disable-model-invocation: true`**, which is why the M3 skill is shipped as `SKILL.md.stub` until it exists.
- `bin/` executables are on PATH only for the **Bash tool**, not for hooks. Hooks therefore go through `plugin/scripts/ccmeter.sh`, which finds the CLI via `ccmeter` on PATH or `~/.ccmeter/cli-path`.
- `--plugin-dir <dir>` loads a plugin for one run without installing (used for the live end-to-end test).

## 4. Transcript layout

```
~/.claude/projects/<cwd with "/" replaced by "-">/<session_id>.jsonl                 main thread
~/.claude/projects/<…>/<session_id>/subagents/agent-<agentId>.jsonl                  one file per subagent
~/.claude/projects/<…>/<session_id>/subagents/agent-<agentId>.meta.json              sidecar (agentType, description, model, parentAgentId, spawnDepth, …); ccmeter ignores it
```
Honours `CLAUDE_CONFIG_DIR`. In all 590 top-level files every entry's `sessionId` equals the file name; no message id appears in two top-level files (resumed sessions do not duplicate history across files). Subagent entries have `isSidechain: true` and an `agentId`, and **appear only in the subagent files, never in the main file**.

**Do not parse with `readline`.** It splits on U+2028/U+2029 as well as `\n`; real transcripts contain those characters unescaped inside JSON strings, so `readline` produced 112 false "unparsable" lines in a 57k-line corpus. ccmeter splits on `\n` only (regression test included).

### Entry types (top-level `type`; counts over the corpus)
Read by ccmeter: `assistant` (14,978), `user` (9,037), `system` (368), `cost-state` (538).
Known and ignored (counted, not "unknown"): `attachment` 18,545 · `atis-latch` 3,198 · `last-prompt` 3,191 · `queue-operation` 2,130 · `custom-title` 1,416 · `mode` 1,036 · `agent-name` 898 · `ai-title` 744 · `bridge-session` 623 · `file-history-delta` 336 · `artifact-autoreact-ledger` 203 · `frame-link` 166 · `file-history-snapshot` 132 · `artifact-comment-monitor` 18 · `permission-mode` 5.
`system` subtypes seen: `stop_hook_summary` 339, `api_error` 16, `compact_boundary` 7, `turn_duration` 3, `local_command` 2, `away_summary` 1. `attachment` has ~40 subtypes (system-prompt snapshots, tool lists, hook results, …); none carry billable usage.
Any other `type` is counted in `parse_stats.unknownTypes` and shown by `ccmeter doctor`.

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

- **Streaming duplicates.** One transcript line is written per content block, all with the same `message.id` (7,437 repeated ids in 14,978 entries). Usage can be a partial snapshot on earlier copies (`output_tokens` 16 → 272 in an observed pair). In 5,102 duplicate groups the **last** copy always had the maximum `output_tokens`, so ccmeter keeps the last copy per id.
- **Synthetic messages.** 252 entries with `model: "<synthetic>"`, `isApiErrorMessage: true`, `stop_reason: "stop_sequence"`: API errors rendered as messages. Ignored.
- **Model ids** are seen both dated and undated: `claude-opus-5-5`, `claude-opus-5`, `claude-sonnet-5-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`. `claude-opus-5` and `claude-opus-5-5` are different models (Opus 5 vs 5.5), not aliases.
- **`stop_reason: null`** on the final copy of a message means an unfinalized streaming snapshot (see Known discrepancies).
- `speed` was `"standard"` or absent in all data; `"fast"` (fast mode) was never observed.

### User entry and the definition of a "turn"
Observed shapes (counts): `tool_result` array 7,905 (not prompts) · string with `promptSource: sdk` 827 · `isMeta` entries ≈ 170 (local-command caveats, injected reminders) · `<task-notification>` / `promptSource: system` 102 · slash commands `<command-name>…` 30 · `isCompactSummary` 7 · `text`-block arrays 47 · typed prompts 2.
ccmeter counts a **turn** as a non-sidechain `user` entry that is not `isMeta`, not `isCompactSummary`, not `promptSource: "system"`, and whose content is a non-empty string not starting with a harness tag (`<command-name>`, `<local-command`, `<task-notification`, `<system-reminder`, …) or an array containing a `text` block. Subagent messages are assigned to the turn their timestamp falls in.

### Compaction
`{"type":"system","subtype":"compact_boundary","timestamp":…,"compactMetadata":{"trigger":"manual"|"auto","preTokens":799627,"postTokens":16951,"durationMs":…,"preservedSegment":{…},…}}`, followed by a `user` entry with `isCompactSummary: true`. The compaction summarisation call itself is **not** an assistant entry (see discrepancies).

### `cost-state` entry (Claude Code's own accounting)
```
{"type":"cost-state","sessionId":…,"totalCostUSD":0.020972,"totalAPIDuration":…,"totalDuration":…,
 "modelUsage":{"<model>":{"inputTokens","outputTokens","thinkingTokens","cacheReadInputTokens","cacheCreationInputTokens","webSearchRequests","costUSD"}},
 "hasUnknownModelCost":false}
```
Several per file (snapshots); the last one wins. 538 entries in 521 sessions. Presence is **not predictable from the version**: found in files of 2.1.247, .281, .286, .287 and .295 (e.g. 429 of 430 files of 2.1.287), absent in all 62 files of 2.1.263 and in the few files of .236/.288/.289/.293. ccmeter treats absence as normal. ccmeter uses it **only as an oracle** for cross-checks (`ccmeter report --session`, `doctor`).

## 5. Pricing facts (verified against `cost-state`)

`ccmeter doctor --verify-pricing` feeds Claude Code's own token counts through `pricing.json` and compares with Claude Code's own `costUSD`:

| model | in $/MTok | out | cache read | 5m write | 1h write | status |
|---|---|---|---|---|---|---|
| claude-sonnet-5-5 | 2 | 10 | 0.20 | 2.50 | 4 | exact on 297 sessions (error < $0.00001) |
| claude-haiku-4-5 | 1 | 5 | 0.10 | 1.25 | 2 | exact on 3 sessions |
| claude-opus-5-5 | 4 | 20 | 0.20 | 5 | 8 | reproduces CC to the cent for both an all-1h session ($4.807677) and an all-5m session ($33.1488) |
| claude-opus-5, others | list price | | | | | **list only, not verified** (1 in-range Opus 5 session) |

- Claude Code bills **the main thread's cache writes at the 1h tier and subagents' at 5m** (observed). cost-state does not split writes by TTL, so the verification checks the cost falls inside the 5m…1h range.
- `webSearchPerRequest` ($0.01), fast-mode ×2 and Haiku 5.5 long-context rates come from published list prices and were **never exercised** in this corpus.

---

## Known discrepancies between ccmeter and Claude Code's own totals

Token totals equal Claude Code's `cost-state` exactly for most sessions, but not all. Each cause below is classified.

1. **Subagent output tokens are a lower bound — verified.** In subagent transcripts, 1,179 of 1,492 final message entries (79 %) have `stop_reason: null`, i.e. an unfinalized snapshot averaging ≈ 9 output tokens; in main transcripts 0 of 5,835 do. Evidence in session `74ac81b4`: its Opus tokens come entirely from subagents; input, cache-write and cache-read match Claude Code to the token while output is 83,229 (transcript) vs 658,866 (Claude Code). The tokens cannot be recovered from the transcript, so ccmeter flags `partial_messages` per session and shows Claude Code's figure next to its own.
2. **Claude Code sometimes bills more input/cache than the transcript shows — observed, cause not verified.** `74ac81b4` Sonnet: +742k input tokens vs transcript. `ea5ca058` (no subagents, 6 turns over 4 days): CC has +10.6k input, +2.3M cache-read over the transcript already at its first snapshot. Hypotheses, **untested**: API calls that never become assistant entries (compaction summarisation, side queries), or cost carried over from a resumed predecessor session.
3. **`cost-state` can lag the transcript** (it is a snapshot written at specific moments).

Across the corpus, after the fixes above, token totals match Claude Code for the large majority of (session, model) pairs; the exact count is printed by `ccmeter doctor` and recorded in `docs/ACCEPTANCE.md`.

## Not verified

- Live `statusLine` stdin payload (docs only). Interactive (non-`-p`) behaviour of the async `Stop` hook.
- What `advisorModel` (present on ~40 % of assistant entries) bills as, and whether advisor calls appear in `usage`.
- Fast mode, web search billing, long-context surcharges, `claude-opus-5` and other list-only prices.
- Behaviour of `/clear`, `--resume` and `--fork-session` on session files beyond "no duplicated message ids across files, file name = session id".
- Transcript format of Claude Code < 2.1.236 or ≥ 2.2: no parser is claimed for them; `doctor` warns.
