# agent-lens — Scope (v2, 2026-10-17)

**Status:** v2 is the owner's document of 17 Oct 2026, condensed here. How it meets the standing invariants:
[ADR 0009](decisions/0009-scope-v2-analyst-and-org-layer.md) (**proposed**: items marked **[O#]** await the owner).
v1 (M1 core + recorder, M2 dashboard + status line) is built and tagged `m1`, `m2`; its original plan is in git
history (`git log -- docs/SCOPE.md`).

## What it is
agent-lens turns Claude Code sessions into evidence: what they cost, where the harness causes friction, which practices
are missing, and what each ticket consumed. It starts as a local git repo (plugin, CLI, dashboard) and grows into an
opt-in org layer that sees feature rows only, never transcript text.

Since v1: a coaching and harness-improvement loop (per-session evidence, cross-workspace trends, measured fixes);
session **modes and phases** judged by their own rubrics; **goals** (sessions stitched into one task, linked to
tickets); **cost discipline** (code finds patterns, an LLM labels short spans; target: the LLM sees under 5 % of raw
transcript tokens); an **anti-hallucination contract** (fixed taxonomy, code-checked citations, human-written advice,
precision gate).

## Audiences (same data, different aggregation; nobody sees another person's transcript)
| User | Questions | Sees |
|---|---|---|
| Individual developer | What did this session or ticket cost? Which habits waste time? What next? | Own sessions, evidence, 1–3 weekly actions, own before/after |
| Harness owner | Which tools, permissions, skills, MCP servers cause friction? Did my change help? | Ranked pain-point backlog, intervention effects |
| Team or org lead | Adoption trend? Where to build shared skills? Cost per ticket? | Aggregates only, minimum group 5, per workspace and stack |

Success: people change habits because the evidence convinced them; harness fixes are chosen by measured impact;
per-ticket AI cost is trusted enough to appear in Jira.

## Phases and milestones
Each phase is usable alone and reuses the earlier schema. Milestone order after M2 is **proposed** (owner picks).

| Phase | Delivered as | In scope | Explicitly out | State (2026-10-17) |
|---|---|---|---|---|
| **A. Personal meter** | plugin, CLI, local dashboard | tokens, cost estimate, model switches, compactions, status line, **harness fingerprint, active time** | any network call | M1 + M2 built, verified. Fingerprint and active time missing |
| **B. Personal analyst** | same repo | modes and phases, Tier 0 features, heuristic gap detectors, on-demand review, goal stitching, intervention log | automatic LLM review of every session | M3 digest/judge **designed only**; the rest not designed |
| **C. Team pilot** | same repo + opt-in exporter + small central store | feature rows (no text) from 1–2 teams, workspace registry, trend dashboard, gold set and precision numbers, cluster diagnosis | org-wide rollout, Jira write-back | not started; **gated** (ADR 0009 #1) |
| **D. Org layer** | central service, possibly an npm package | cross-workspace trends, adoption maturity, shared fix-once backlog, Jira cost/time sync, other sources (Copilot org metrics) | individual rankings, any manager view of a person | not started; gated |

Proposed milestones for Phase B (each ends with verification and a tag):
| Milestone | Content | Tokens spent |
|---|---|---|
| **M3 Evidence base** | schema v2; harness fingerprint; active time; Tier 0 counters (tool errors, retries, cache rate, permission stalls, skills/MCP/subagent use) after each input is **observed** in `FORMATS.md`; detectors for `docs/GAPS.md` types as `draft`/`hint`; `agent-lens digest` | none |
| **M4 Modes, phases, goals** | phase segmentation; ticket attribution from branch with manual override; attribution % beside every per-ticket number; goal stitching | none (a small model only for ambiguous mode labels, on demand) |
| **M5 On-demand analyst** | in-memory digest, redaction, `claude -p` judge, Tier 2 diagnosis on flagged spans, citation verification, "this is wrong", review overhead metered (ADR 0007) | on demand only |
| **M6 Interventions** | fingerprint-keyed before/after, timeline annotations (upgrades, model changes), "consistent with improvement" wording, ≥ 15–20 sessions a side | none |
Gold-set labelling runs alongside M3–M5 (dogfood first: the owner's sessions). Phase C starts only when its gate
evidence exists, not on a date.

Works with: Claude Code CLI, its VS Code and JetBrains integrations, headless `claude -p`. Not covered: claude.ai
chat, Claude Code cloud sessions (transcripts are not local), other agent tools until an adapter exists.

## Analysis engine (code finds, the LLM explains; each tier is cheaper than the next)
| Tier | Work | Input | Tokens |
|---|---|---|---|
| 0. Extract | parse transcript, settings fingerprint, git → feature row + event list | whole transcript | none |
| 1. Triage | mode/phase segmentation, rule detectors, lexical clustering (embeddings only if a dependency is approved) | features, opening prompts | none |
| 2. Diagnose | small model labels flagged spans into the taxonomy, with citations | a prompt + next 2–3 turns, ~1–3k tokens per flagged session | low, on demand |
| 3. Synthesize | stronger model explains each recurring cluster once; fills a playbook entry | a sample of spans per cluster | amortized |
| On demand | full session review: summary + prompt analysis | digest, ~5–15k tokens | one call, when asked |

### Modes and phases
Phases (explore, diagnose, fix, verify, discuss) split at the first edit, first test run, or a user turn like "ok, now
fix it"; each is judged by its own rubric. Execution: clear spec, low correction rate, verified edits. Debugging:
bug-report quality (symptom, repro, logs, likely module, what was tried) and convergence. Exploration: convergence,
repeat exploration, findings captured. Discussion: decision reached, trade-offs grounded in files read. Review:
specific, actionable findings. Boundaries are heuristic and measured against the gold set.

### Variables
Task context (size, type, outcome) first; prompting; context and sessions (compactions, drift, splits, `/clear`,
CLAUDE.md); planning; model fit; skills; subagents; MCP (configured vs used, failures); tool friction; verification;
cost hygiene (cache hit rate, cost-per-turn slope, cost per goal). **Gaps come from combinations, never one count.**

### Evidence rules
1. Fixed taxonomy (`docs/GAPS.md`); the model classifies, never free-writes a diagnosis.
2. Citations are references `(session, turn, byte range, hash)` verified by code against the transcript; a claim whose
   span does not match is dropped.
3. Unknown vs unshared: vague input is a gap only when a later user turn shows the information was already known.
4. Human-written playbook: advice per gap type is reviewed by people; the LLM fills in specifics only.
5. Precision gate: a type is shown (not just hinted) only after it reaches the agreed precision on a hand-labelled gold
   set. **[O3]** proposed 85 %; labeller to be named.

## Expectations vs reality (what users are told up front)
| Output | Realistic accuracy | Why not better |
|---|---|---|
| Token counts per session | High | API usage fields, after streaming duplicates and subagents are handled; calls absent from the transcript are a measured gap (`FORMATS.md`) |
| Cost | Estimate within a few percent of list price | price table; enterprise/Bedrock/Vertex differ; on a subscription it is API-equivalent, not a bill |
| Model switches | Good | inferred from consecutive messages; subagent models are tagged |
| Active time | Approximate | idle threshold; AI-session time, not human time saved |
| Per-ticket cost and time | As complete as attribution | sessions off a ticket branch go to an unattributed bucket; show attribution % |
| Mode and phase labels | Good on clear cases, noisy on mixed | heuristic boundaries; gold-set measured |
| Gap findings | target 85 %+ precision per shown type | only gated types shown; recall will be lower |
| Prompt quality scores | Directional | one session is a small sample |
| Intervention effects | "Consistent with improvement", not causal | task mix, model and version changes confound |
| Org trends | Good in aggregate | normalization imperfect; groups under 5 suppressed |

## Hard parts
Transcript format drift (versioned parser, golden fixtures, `doctor`, named owner) · mode/phase segmentation ·
goal stitching (works with tickets, poorly without; **the owner's corpus has no ticket-key branches**, 2026-10-17) ·
judging appropriateness ("should have used plan mode") · building the gold set (100–200 sessions, consent) ·
before/after confounders · redaction (tested) · trust and adoption (design and communication).

## Not possible or not worth doing
Zero hallucination (target: high precision, code-verified citations, a "this is wrong" control on every finding) ·
causal proof of a harness fix from observational data · human time saved or productivity · judging code correctness ·
per-conversation cost for Copilot Chat · claude.ai and cloud sessions without an export path · a stable contract with
the transcript format · fair individual rankings (**not built, by design**) · exact billed cost on subscription or
negotiated plans.

## Hard constraints (amended by ADR 0009; unchanged unless stated)
1. **Local-first.** No agent-lens code reachable from hooks, status line, server or the default CLI makes a network call.
   Org export is a local file first (ADR 0009 #1). Any dependency or feature that would make a call needs the
   owner's approval.
2. **Zero context footprint.** Hooks, status line and server run out of process; no MCP server; `/agent-lens` prints one
   line; the weekly digest is a CLI command and a dashboard page, never injected into a session; a review skill only
   wraps `agent-lens review <id>`.
3. **Install-method independent.** Reads `~/.claude`, writes only under `~/.agent-lens`; no absolute paths in the repo.
4. **Publish-ready, not published.** Never publish or push without the owner's approval.
5. **Stack.** TypeScript on Node ≥ 22.13, `node:sqlite`, zero runtime dependencies (ADR 0002); Vite + React dashboard
   on `127.0.0.1` only.

## Non-negotiable behaviours
- **No guessing external formats.** Every input a detector uses is observed and recorded in `FORMATS.md` first.
- **Parsers are fault tolerant**, selected by recorded Claude Code version; unknown things are counted, not fatal.
- **Unpriced is not free**: unknown models cost `NULL` and surface in `doctor` and the UI.
- **The recorder is idempotent** (full recompute + upsert). Hooks print nothing and exit 0.
- **Own-judge runs are tagged** (`source=agent-lens-judge`) and shown as overhead, not usage.
- **No transcript text stored**: counts, ids, models, timestamps, titles, cwd, labels and span *references*. Model-written
  review text only per **[O1]**, in `~/.agent-lens`, never exported.
- **No leaderboards or per-developer rankings**; minimum group 5 for any aggregate shown to someone else.
- **Shipped migrations are immutable**; new tables arrive as v2+.

## Risks and governance
| Risk | Mitigation |
|---|---|
| Transcripts hold proprietary code and client data | raw content stays on the machine; only feature rows and labels are exported; redaction before any LLM call |
| Findings used for performance management | individual views private; aggregates with group ≥ 5; no rankings; written usage policy |
| Regulated environments | security/compliance (HR/works council) review before Phase C; LLM tiers only on approved endpoints |
| Wrong findings erode trust | precision gate, "this is wrong" on every finding, evidence links |
| Jira write-back is a new outbound flow | opt-in module, aggregates only, idempotent per ticket, separate approval |
| Unmaintained | named owner for parser, prices, playbook; `doctor` warnings, not silent errors |
| Analysis cost grows | funnel, sampling, caching; the tool meters its own spend |

## Acceptance
- **v1 (met):** token totals match Claude Code on sampled sessions (306 of 310 token-exact, 2026-10-15; causes of the
  rest in `FORMATS.md`); a new release yields correct data or a `doctor` warning; clone to dashboard in under 5 min.
- **Programme (measured in the pilot):** every shown gap type meets the threshold and fewer than 1 in 10 findings are
  marked wrong; analysis spend is a few percent of the analysed sessions' cost; users act on at least one weekly
  action and the behaviour changes in later sessions; one harness fix chosen from the backlog shows consistent
  improvement across workspaces.

## Open decisions
| # | Decision | State |
|---|---|---|
| 1 | Core language | **closed**: TypeScript/Node (ADR 0002) |
| 2 | Primary signal source | transcripts primary; OTel optional after observation. **O2: paid test approved 2026-10-18, not yet run** |
| 3 | LLM tiers, endpoint | `claude -p`, on demand (ADR 0007); approved endpoints per company |
| 4 | Stored model-written review text | **O1 closed 2026-10-18: store it** in the local database, one analysis per session; CSV export; Windows unverified |
| 5 | Precision threshold and gold-set labeller **[O3]** | open (85 % proposed) |
| 6 | Jira: Cloud or Data Center; field, worklog or comment | open (Phase D) |
| 7 | Pilot teams and sponsor | open (Phase C) |
| 8 | Owner of parser, price table and playbook after the pilot | open |
