# Gap taxonomy and playbook (draft v0)

**Updated:** 2026-10-17 · **Status of every entry: `draft`.** Detectors do not exist yet; advice is **drafted by the
agent and not yet reviewed by a person** (Scope v2 requires human-reviewed advice before a type is shown).
Rules that govern this file: `docs/SCOPE.md` (Evidence rules), `docs/decisions/0009-*`.

## How to read an entry
| Field | Meaning |
|---|---|
| Modes | where the gap can apply (execution, debugging, exploration, discussion, review) |
| Audience | `developer` (own sessions, private) or `harness` (ranked per workspace, never per person) |
| Signal | detection rule, from combinations, never one count |
| Evidence | what a finding must cite: span references `(session, turn, byte range, hash)`, checked by code |
| Not a gap | exclusions, incl. *unknown vs unshared* |
| Input status | `observed` = recorded in `FORMATS.md`; `unverified` = must be observed (cheap, zero spend) before coding |
| Playbook | the recommendation; the model may only fill in specifics |

## Lifecycle and rules for all types
- `draft` (detector exists, nothing shown) → `hint` (local user only, badged "unverified", with "this is wrong") →
  `shown` (precision on the gold set ≥ threshold, **[O3]** 85 % proposed) → `retired` (below threshold twice running).
- A finding is dropped if its cited span fails the hash check. A session with `partial` messages (output lower bound)
  is not scored on output-size signals.
- Thresholds in the Signal lines are **placeholders to calibrate** on the gold set; none is measured yet.
- Wording: findings say "this session shows …", never "you are …"; effects are "consistent with", never "caused".
- Harness-audience gaps are explained at workspace level; the same finding is never listed per person.

## Detector inputs (what exists today)
| Input | Status | Source |
|---|---|---|
| Per-message tokens, model, sidechain, turn, cache read/write | observed, stored | `messages` table |
| Compaction, model-switch events | observed, stored | `events` table |
| Turn boundaries and real user prompts | observed | `FORMATS.md` "User entry" |
| Session `gitBranch`, `cwd`, entrypoint | observed in parser, **branch not stored** | `core/parser` |
| `tool_use` blocks (tool name, input) in assistant content | observed for counting; **names/inputs not stored** | transcript |
| `tool_result` entries (7,905 in the corpus) | observed as non-prompts; their content and size not recorded | `FORMATS.md` |
| `tool_result.is_error` | **unverified** (named in the M3 design only) | – |
| Permission prompts / denials | **unverified**: how they appear (entry or tool_result text) is unknown | – |
| Skill invocations, MCP tool names (`mcp__<server>__<tool>`), subagent launch tool | **unverified** as transcript facts | – |
| `permission-mode` entries (5 in corpus), `mode` entries (1,036) | types observed; **contents unknown** | `FORMATS.md` entry types |
| `system` subtypes `api_error`, `compact_boundary`, `turn_duration`, `stop_hook_summary` | observed | `FORMATS.md` |
| Harness fingerprint (hash of CLAUDE.md, settings, skills, plugins, MCP config, version) | **not built** | – |
| API calls missing from the transcript | observed gap, estimated | `FORMATS.md` Known discrepancies 2 |

## Summary
| ID | Gap | Modes | Audience | Main inputs | Feasible now |
|---|---|---|---|---|---|
| G01 | Repeat exploration | exploration, debugging | developer | file-read tool inputs | needs tool-input observation |
| G02 | Under-specified request, info known later | execution, debugging | developer | prompts, later turns | needs Tier 2 (LLM) |
| G03 | Correction loop | execution | developer | prompt text after assistant turns | partly (phrases), needs Tier 2 |
| G04 | Debugging without repro or logs | debugging | developer | tool order, prompt content | needs tool names |
| G05 | Unverified edits | execution | developer | edit tools vs test/build runs | needs tool names |
| G06 | Context bloat and scope drift | all | developer | tokens per turn, compactions, cwd/files | **yes** (tokens), drift needs tool inputs |
| G07 | Plan skipped on a large task | execution | developer | permission-mode, edit volume | needs `permission-mode` contents |
| G08 | Model misfit | all | developer | model, tokens, tool use | **yes** (cost side), fit needs mode |
| G09 | Tool friction (errors, retries) | all | harness | `is_error`, repeated tool inputs | needs `is_error` |
| G10 | Permission stalls | all | harness | permission prompts | needs observation |
| G11 | Configured but unused or failing capability | all | harness | fingerprint, tool names | needs fingerprint + names |
| G12 | Cache and large-read waste | all | developer + harness | usage fields, result sizes | **yes** (cache), reads need sizes |

## G01 Repeat exploration
- **Signal:** the same file or directory is read ≥ N times (placeholder N = 4) across turns of one exploration or
  debugging phase with no edit to it in between, or in ≥ 3 sessions in one workspace within 14 days.
- **Evidence:** the first and the repeating read of one path (tool_use spans); path text is shown by re-reading, not stored.
- **Not a gap:** reads after the file changed on disk; reads in different subagents' fresh contexts (counted once per agent).
- **Input status:** tool_use name/input observed as blocks, not yet extracted; unverified for path field names.
- **Playbook (draft):** put the stable facts about that module (purpose, entry points, conventions) in the project
  `CLAUDE.md` or a short doc the agent is told to read first, so exploration is captured once instead of repeated.

## G02 Under-specified request, information known later
- **Signal:** a first prompt of a phase lacks the target (file, symptom or acceptance check), **and** a later user
  turn in the same phase supplies information that existed when the first prompt was written (stated earlier in the
  session, or present in the prompt of an earlier session on the same goal). Both conditions are required (*unknown vs unshared*).
- **Evidence:** the vague prompt span and the later span that carries the missing information.
- **Not a gap:** the information was genuinely discovered mid-session (a failing log the user had not yet seen); a
  deliberately open exploration prompt.
- **Input status:** prompt text observed; judging "was already known" needs a Tier 2 label. No zero-token detector.
- **Playbook (draft):** lead with goal, location and a done-check ("fix X in `foo/`, done when `npm test` passes").
  One sentence of each removes most clarifying round trips.

## G03 Correction loop
- **Signal:** within one phase, ≥ 2 user turns whose opening matches correction wording (e.g. "no", "that's wrong",
  "I said", "undo", "revert"), each directly after an assistant action; rate rises with cost spent after the first.
- **Evidence:** each correction span plus the assistant turn it follows.
- **Not a gap:** a user narrowing scope by choice ("also do Y"); corrections of a plan before any edit (that is the
  plan working).
- **Input status:** phrase matching on observed prompt text works as a *candidate*; the language-dependence and false
  positives are unmeasured. Final label needs Tier 2.
- **Playbook (draft):** when the second correction arrives, stop and restate the goal and the constraint that was
  missed in one message, or start a fresh session with that summary, instead of patching turn by turn.

## G04 Debugging without repro or logs
- **Signal:** in a debugging phase the first edit comes before any run of a test/command and before any log or error text
  appears in the user's prompts; convergence is slow (turns and cost to the first passing check above a per-workspace median).
- **Evidence:** the debugging prompt, the first edit span, and the absence of a prior run (cited as the turn range checked).
- **Not a gap:** a bug whose cause is evident from a stack trace pasted in the prompt; trivial typo fixes (small task size).
- **Input status:** needs tool names (Bash, edit tools) and ordering: unverified.
- **Playbook (draft):** give the symptom, the exact command that reproduces it, the log or error, and what was already
  tried. Ask for a failing test before any fix.

## G05 Unverified edits
- **Signal:** a session ends, or reaches a "done" statement, with code-editing tool calls and no test, build, lint or
  typecheck command after the last edit.
- **Evidence:** the last edit span and the turn range with no verifying command.
- **Not a gap:** docs-only or config-only edits; workspaces with no tests (declared in the fingerprint); a user who
  states they verify elsewhere.
- **Input status:** tool names and Bash commands unverified; "verifying command" needs a per-stack list.
- **Playbook (draft):** add the verify command to `CLAUDE.md` ("run `npm run verify` before saying done") so the agent
  runs it unprompted; consider a Stop hook for projects where it is cheap.

## G06 Context bloat and scope drift
- **Signal (tokens, observable now):** cost per turn rises across the session (slope above a calibrated threshold)
  with no `/clear`, and/or ≥ 2 compactions; **drift:** the set of files touched in the last third shares little with the
  first third (needs tool inputs) while the goal key (branch) is unchanged.
- **Evidence:** the per-turn cost series (reproducible from `messages`) and, for drift, two file-path samples.
- **Not a gap:** a long single-purpose session whose cost grows because the task is large and context is needed;
  compaction directly after finishing a sub-task.
- **Input status:** tokens per turn and compactions observed and stored; file sets unverified.
- **Playbook (draft):** finish one task per session; use `/clear` between unrelated tasks; when a session passes its
  first compaction, restate the goal and the three facts that must survive, or split.

## G07 Plan skipped on a large task
- **Signal:** a task estimated large (edit volume across ≥ N files, or ≥ M turns before the first verification) that
  started without a permission-mode change into plan mode, in a workspace where plan-first sessions show lower rework
  (per-stack baseline; otherwise do not emit).
- **Evidence:** the opening prompt, the first edit, and the absence of a plan-mode entry.
- **Not a gap:** small tasks (the common case); a user who wrote a plan in the prompt.
- **Input status:** `permission-mode` entries exist (5 in the corpus) but their contents are unknown; unverified.
  Appropriateness depends on estimated task size: lowest-confidence type, last to reach the gate.
- **Playbook (draft):** for changes touching many files or with unclear approach, ask for a plan first and approve it
  before edits; keep the plan in the repo if the work spans sessions.

## G08 Model misfit
- **Signal:** (a) the most expensive model on a session with few turns, small outputs and no multi-file edits; or (b) a
  small model across a long loop of failures (G03/G09 present) with no switch. Cost impact is computed from the price table.
- **Evidence:** the model per message series and the cost delta against the alternative at list price (an estimate, labelled).
- **Not a gap:** subagent models (tagged, never counted as switches); a user's deliberate choice stated in the prompt.
- **Input status:** model, tokens and cost observed and stored. Fit judgement needs mode and task size.
- **Playbook (draft):** use the smaller model for lookups, summaries and mechanical edits; move up for design,
  debugging and review. Switch deliberately, not midway through a failing loop.

## G09 Tool friction
- **Signal:** the same tool with near-identical input ≥ 3 times within a phase, or an error rate (errored results per
  tool call) above a per-workspace baseline for one tool; aggregated per tool and workspace.
- **Evidence:** the repeated tool_use spans and their results (re-read, not stored).
- **Not a gap:** an intentional poll; failures from the user's own code under test.
- **Input status:** `is_error` and result shapes **unverified**; repeated-input detection needs tool inputs.
- **Playbook (draft, harness owner):** fix the cause once: the wrong default path, missing tool in the allowlist, flaky
  script, unclear tool description or CLAUDE.md instruction; then measure the rate (M6).

## G10 Permission stalls
- **Signal:** the same tool or command pattern requires approval repeatedly (≥ N times across sessions of one
  workspace) and is approved each time.
- **Evidence:** the approval events (form unknown today).
- **Not a gap:** commands that should stay gated (destructive, outward-facing).
- **Input status:** unverified; first task is to observe how prompts and decisions appear (a transcript entry, a hook
  event, or only OTel `tool_decision`, per the docs-only note in `FORMATS.md`).
- **Playbook (draft, harness owner):** add narrowly scoped allow rules for safe, repeated read-only commands; keep
  write and network commands gated.

## G11 Configured but unused or failing capability
- **Signal:** an MCP server, skill or plugin present in the fingerprint is never invoked over ≥ 20 sessions in the
  workspace, or its tool calls fail at a high rate; a capability that costs always-on tokens and is never used ranks highest.
- **Evidence:** the fingerprint entry and the count of sessions checked (no per-prompt text needed).
- **Not a gap:** capabilities for rare tasks (listed by owner as "occasional"); newly installed ones (< 20 sessions).
- **Input status:** fingerprint not built; skill/MCP invocation forms unverified. Always-on cost is observable with
  `claude plugin details` (ccmeter's own cost was measured that way, `FORMATS.md`).
- **Playbook (draft, harness owner):** remove or disable what is unused; fix or replace what fails; move rarely used
  capabilities to on-demand loading.

## G12 Cache and large-read waste
- **Signal (cache, observable now):** low `cache_read` share of input-side tokens across a session; repeated
  `cache_write` after an idle gap (cache expiry) in a session that resumed; **large reads:** single tool results far
  above the workspace median that are followed by no use (needs result sizes).
- **Evidence:** per-message cache read/write series and the idle gap between the two turns (reproducible from `messages`).
- **Not a gap:** first turn of a session (nothing to read yet); a deliberately fresh context.
- **Input status:** usage fields observed (including 1-hour cache writes); result sizes unverified; the cache TTL
  that applies is not recorded here, so expiry is inferred from the data, not assumed.
- **Playbook (draft):** keep working in one session while the cache is warm; avoid pasting or reading whole large
  files when a range or a search is enough; put stable instructions in `CLAUDE.md` rather than re-pasting them.

## Order of work (proposed)
1. Zero-spend observation of the unverified inputs above (one `FORMATS.md` pass, via the `transcript-surveyor`
   subagent; aggregates only).
2. Detectors that need only stored data: G06 (tokens), G08 (cost side), G12 (cache). Shown as counters first.
3. Detectors after observation: G09, G05, G01, G04, G10, G11.
4. Tier 2 types: G02, G03, G07 (judged, on demand, last to reach the gate).
5. A person reviews every playbook entry before its type leaves `hint`.
