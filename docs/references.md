# References

**Updated:** 2026-10-15

External sources that informed a decision, with provenance class and what they changed. Sources read and not acted
on are listed too.

| Source | Class | Read | What it changed |
|---|---|---|---|
| code.claude.com/docs/en/hooks (first 100k of 270k chars) | vendor docs | 2026-10-14 | hook config shape, `${CLAUDE_PLUGIN_ROOT}`, timeouts, SessionEnd 1.5 s budget, `async`; payloads then captured live |
| code.claude.com/docs/en/statusline | vendor docs | 2026-10-14 | stdin fields; `context_window` is current, not cumulative → status line reads the transcript |
| code.claude.com/docs/en/plugins-reference | vendor docs | 2026-10-14 | manifest layout, `bin/` only on the Bash tool PATH → hook launcher script |
| code.claude.com/docs/en/plugin-marketplaces | vendor docs | 2026-10-14 | `claude plugin marketplace add` / `install` used by `ccmeter setup` |
| `claude-api` skill pricing table (cached 2026-10-06) | bundled vendor reference | 2026-10-14 | list prices in `pricing.json`; verified ones later checked against Claude Code `costUSD` |
| `dataviz` skill reference palette | bundled design reference | 2026-10-14 | dashboard colours, mark specs, table view per chart |
| User's Context Harness guides: `context-and-loop-engineering.md`, `implementation-kit.md` (~/Documents/context-harness/docs/guides, 2026-09-28) | internal method, measured on another repository | 2026-10-15 | this repository's agent harness (`docs/harness.md`) |
| Live captures: hook payloads, `claude plugin details`, `-p` debug logs (Claude Code 2.1.287) | first-hand observation | 2026-10-14/15 | `docs/FORMATS.md`, decisions 0003 and 0006 |
