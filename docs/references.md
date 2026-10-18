# References

**Updated:** 2026-10-17

External sources that informed a decision, with provenance class and what they changed. Sources read and not acted
on are listed too.

| Source | Class | Read | What it changed |
|---|---|---|---|
| agent-lens Scope v2, owner's document of 17 Oct 2026 (pasted in chat; condensed in `docs/SCOPE.md`) | owner requirements | 2026-10-17 | phases A–D, tiers, modes, evidence rules, gap taxonomy requirement, ADR 0009 and `docs/GAPS.md`; its survey of ccusage, Claude Code analytics, OTel, Faros/DX/Jellyfish/LinearB, Langfuse/LangSmith was **not re-verified** here |
| code.claude.com/docs/en/hooks (first 100k of 270k chars) | vendor docs | 2026-10-14 | hook config shape, `${CLAUDE_PLUGIN_ROOT}`, timeouts, SessionEnd 1.5 s budget, `async`; payloads then captured live |
| code.claude.com/docs/en/statusline | vendor docs | 2026-10-14 | stdin fields; `context_window` is current, not cumulative → status line reads the transcript |
| code.claude.com/docs/en/plugins-reference | vendor docs | 2026-10-14 | manifest layout, `bin/` only on the Bash tool PATH → hook launcher script |
| code.claude.com/docs/en/plugin-marketplaces | vendor docs | 2026-10-14 | `claude plugin marketplace add` / `install` used by `agent-lens setup` |
| `claude-api` skill pricing table (cached 2026-10-06) | bundled vendor reference | 2026-10-14 | list prices in `pricing.json`; verified ones later checked against Claude Code `costUSD` |
| `dataviz` skill reference palette | bundled design reference | 2026-10-14 | dashboard colours, mark specs, table view per chart |
| User's Context Harness guides: `context-and-loop-engineering.md`, `implementation-kit.md` (~/Documents/context-harness/docs/guides, 2026-09-28) | internal method, measured on another repository | 2026-10-15 | this repository's agent harness (`docs/harness.md`) |
| Live captures: hook payloads, `claude plugin details`, `-p` debug logs (Claude Code 2.1.287) | first-hand observation | 2026-10-14/15 | `docs/FORMATS.md`, decisions 0003 and 0006 |
| github.com/ryoppippi/ccusage (via web search summaries; repo not read) | third-party tool, MIT | 2026-10-15 | comparison with alternatives in chat; not verified against the repo |
| github.com/phuryn/claude-usage, sadhakbj/clauditor, ccboard, nateherkai/token-dashboard (search summaries only) | third-party tools | 2026-10-15 | same; not verified against the repos |
| docs.anthropic.com/en/docs/claude-code/monitoring-usage; platform.claude.com Claude Code Analytics API | vendor docs (search summaries) | 2026-10-15 | OpenTelemetry and org-level analytics as the non-local alternatives |
