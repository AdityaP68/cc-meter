# 0009 — Scope v2: from meter to analyst; how it fits the invariants

**Status:** proposed 2026-10-17. The resolutions below are the author's; each marked **[O#]** needs the owner's
yes or a change before it binds. Until accepted, `AGENTS.md` and the shipped behaviour are unchanged.
**2026-10-18, owner's answers in chat:** O1 yes, store the review (see row 3); O2 yes, the paid test may run (see
row 4); O3 still open (explained to the owner in chat). The environment is **closed**: everything must work from the
machine where Claude Code runs, with no outside service.

**Context.** The owner's *Scope v2* (17 Oct 2026, a document pasted in chat; condensed into `docs/SCOPE.md`) grows
agent-lens from a cost meter into an evidence-backed coaching and harness-improvement system with an opt-in org layer.
Measured against the repo on 2026-10-17: Phase A (meter) is built and verified; Phase B is designed
(`ARCHITECTURE.md` M3) but has no code; no gap taxonomy, modes/phases, fingerprint, goals or interventions exist;
Phases C/D have no design. Aggregates of the owner's corpus (count-only probes, 2026-10-17): 389 recorded sessions
in 54 projects; all 625 transcripts carry a `gitBranch`, none matches a ticket-key pattern (`ABC-123`), and only 5
distinct non-default branch names occur. So ticket attribution cannot be validated on this corpus.

Scope v2 collides with six standing rules. Each row is a conflict and how this ADR resolves it.

| # | Scope v2 wants | Standing rule it hits | Resolution |
|---|---|---|---|
| 1 | Opt-in exporter, central store, Jira write-back (C/D) | No network calls; no org aggregation (`SCOPE`, ADR 0007) | The local product keeps the rule: **no code reachable from hooks, the status line, the server or the default CLI opens an outbound connection.** The org layer is **transport-free first**: `agent-lens export features` writes a local file of feature rows (allowlisted columns, no text, enforced by a test) that the user inspects and moves through the company's own channel. Any agent-lens-made network path (Jira, central service) is a separate module, a separate ADR, and the owner's and security's approval. Phase C does not start before Phase B's gate evidence exists. |
| 2 | Evidence spans, citations "checked by code", digest, mode labels | Never store prompt, reply or tool text (`AGENTS.md`) | Findings store **references, not text**: `(session_id, turn, byte range, sha256 of the span)`. The span is re-read from the transcript to display it and to verify the citation; a mismatch drops the claim. If Claude Code has removed the transcript, the finding keeps its label and loses its evidence view. The digest is built in memory and never persisted (as ADR 0007). Labels (mode, phase, gap id, verdict) are ids and counts. |
| 3 | An LLM review/diagnosis produces text (summary, notes, explanations) | Same rule | **O1 accepted 2026-10-18: store it, because it is the evidence.** Model-written output (summary, per-prompt notes) goes in the `reviews` table of the same SQLite database the dashboard server reads, on the machine where Claude Code runs (nothing elsewhere, never committed), and carries no verbatim transcript quotes (a test rejects stored fields that contain a long span of the transcript). **One analysis per (session, digest, rubric, model)**: the cache key already makes a repeat free, so a review is paid for once. Growth control: reviews are on demand only, a review row is a few KB (an estimate, to measure on the first real reviews), and `doctor` reports the table's size; a `agent-lens forget` command to delete reviews is proposed. **Export:** the dashboard offers a CSV download (opens in Excel; `agent-lens export --format csv` exists today for session rows); a true `.xlsx` file is deferred because writing one without a dependency is extra work. Whether the export may include review text is **[confirm]**: default is counts and labels only, review text only on an explicit tick. **Windows is unverified**: `node:sqlite` and the `~/.agent-lens` path have only been run on macOS; a Windows pass is a gate before claiming support. "Server only" is read as: the dashboard server's database on the Claude machine, no central server (confirm if you meant otherwise). |
| 4 | OTel collector as primary event source; local embeddings | Transcripts are the source of truth (ADR 0001); do not guess formats; zero runtime dependencies (ADR 0002); no network | **Transcripts stay primary.** OTel is an *optional second source*, added only after it is **observed**: the first step is one small paid `claude -p` run in an isolated `CLAUDE_CONFIG_DIR` with the plugin disabled (**O2 accepted 2026-10-18**: the spend is approved, with a 127.0.0.1 `http/json` receiver in a scratch directory, not part of agent-lens; agent-lens never edits `~/.claude/settings.json`; a user opts in by setting env vars themselves). The run is also the **accuracy proof**: OTel `api_request` events are Claude Code's own per-call record (`cost_usd`, tokens), so summing them and comparing with what agent-lens derives from the transcript of the same run shows, call by call, what the transcript misses. *Status: not yet run (2026-10-18, the shell was denied in the session).* Evidence for wanting it: the hidden-call gap (`FORMATS.md` Known discrepancies 2). Embeddings need a model dependency and a download, so **Tier 1 clustering is lexical** (normalized shingles, in memory, nothing persisted but cluster ids) until the owner approves a dependency. |
| 5 | "Reuse ccusage's pricing or OTel's cost; do not rebuild cost reporting" | Zero dependencies; ADR 0005 | Cost reporting is already built and verified (306 of 310 sessions token-exact vs Claude Code, 2026-10-15). Keep it. ccusage stays a comparison reference in `references.md`, not a dependency. No new cost work in v2 beyond closing the hidden-call gap. |
| 6 | Tier 2 small-model labelling of flagged spans; redaction | On-demand only, explicit consent (ADR 0007); judge via `claude -p` | Tier 2/3 run **on demand only** through `claude -p`, tagged `agent-lens-judge`, with the cost estimate printed first and consent on the first run. A batch over many flagged sessions needs an explicit opt-in showing the total estimate. Redaction (secrets, emails, tokens, paths) runs locally *before* a span enters a prompt and has its own tests; no span is sent unredacted. Language: TypeScript stays (ADR 0002); Python is not adopted. |

Further decisions that do not conflict but need recording:
- **Shipped migrations stay immutable.** Everything new (features, fingerprints, phases, goals, findings, feedback,
  interventions) arrives as v2+ migrations; `core/migrations.lock.json` is updated only when one ships.
- **Zero context footprint holds.** The weekly digest is `agent-lens digest` and a dashboard page. Nothing is injected
  into a session; `/agent-lens` still prints one line.
- **Gap types have a lifecycle**: `draft` (detector exists, not shown) → `hint` (shown only to the local user,
  badged "unverified", with a "this is wrong" control) → `shown` (met the precision gate on a hand-labelled gold set)
  → `retired`. This reconciles "ship the digest early" with "only gated types are shown". Pre-gate output is
  presented as counters and hints, never as a diagnosis. **[O3]** Gate proposed at 85 % precision per type; the owner
  names who labels the gold set.
- **Gold-set labels are ids**: `(session_id, turn, gap id, verdict, labeller)`; no text, so they can be shared.
- **"This is wrong"** is a local POST (custom-header guarded, like the other POSTs) that stores a verdict, not text.
- **No rankings, ever.** Individual views are local. Any aggregate shown to anyone else has a minimum group of 5.
  Harness gaps (tool friction, permission stalls, unused MCP) are ranked per workspace, never per person.
- **Wording for estimates**: interpretations are labelled "estimate" or "consistent with", never "caused"; a
  before/after needs about 15–20 sessions a side, else it is not shown.

**Consequences.**
- `docs/SCOPE.md` is rewritten around Scope v2; `docs/GAPS.md` holds the taxonomy and playbook (drafts).
- On acceptance: amend the `AGENTS.md` invariants (spans stored as references; generated review text per O1; org
  export is a file) and `docs/decisions/0007` consequences line; add the `.claude/rules/` entries for the new areas.
- Every detector's input must be **observed** in the transcript and recorded in `FORMATS.md` first; today
  `tool_result.is_error`, permission prompts/denials, skill and MCP tool names and the contents of the `mode` /
  `permission-mode` entries are **unverified** (`docs/GAPS.md` lists each).
- Open owner decisions: O3 (gate and labeller), the two **[confirm]** points in row 3 (export of review text; what
  "server only" means), plus the scope's
  own list: pilot teams and sponsor (C), Jira flavour and field (D), long-term owner of parser, prices and playbook.
- Not decided here: the order of milestones M3–M6 (`SCOPE.md` proposes one; the owner picks).
