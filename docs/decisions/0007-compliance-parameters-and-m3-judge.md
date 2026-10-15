# 0007 — Compliance parameters; `node:sqlite` confirmed; M3 judge via `claude -p`

**Status:** accepted 2026-10-15 (owner's answers in chat). Item (d), the command file, is still open.

**Context.** The owner named the "complaint parameter" as the requirements ccmeter must satisfy for company use.

**Decision.**
| Parameter | How ccmeter meets it | Evidence |
|---|---|---|
| Nothing leaves the company environment | ccmeter code makes no network calls; the server binds `127.0.0.1`; the dashboard has no CDN, font or telemetry URLs; prices come from the committed `pricing.json` | grep of `core cli server plugin dashboard/src` (2026-10-15): the only `fetch` is the dashboard's same-origin `/api` |
| Completely local | SQLite in `~/.ccmeter`, reads `~/.claude/projects`, no account, no key | `docs/SCOPE.md` |
| Accurate | "Accurate" means checked and with disclosed gaps, not infallible: token totals equal Claude Code's own cost-state for 308 of 316 (session, model) pairs (2026-10-15); unknown models cost `NULL`, never `$0`; differences are documented | `ccmeter doctor`, `docs/FORMATS.md` |
| Free for anyone, any use | MIT, `LICENSE`; zero runtime dependencies (`dependencies` is empty), so no third-party runtime licence terms; dev-only dependencies are MIT/Apache-2.0/BSD/ISC/MPL-2.0 | `package-lock.json` licence tally |

- **SQLite:** `node:sqlite`, as in ADR 0002; no `better-sqlite3`.
- **M3 judge:** `claude -p`, as a subprocess of the company-installed Claude Code CLI. ccmeter adds no network call or key handling; the judge session's traffic goes through the channel the company already approved. On-demand only, explicit consent on the first review (session text leaves the machine through that channel), estimated cost printed before running, judge sessions tagged `ccmeter-judge` and excluded from "your usage" (`docs/ARCHITECTURE.md` §3).

**Consequences.** Any future feature that needs the network must be rejected or go to the owner first. A review necessarily sends session text through the Claude CLI; this is the single place where "never store prompt text" meets content, so the digest is built in memory and never persisted. Not yet verified: that bundled dashboard code ships its MIT notices (React); check before any public release.
