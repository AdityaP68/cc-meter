# Current state

**Updated:** 2026-10-15
**Branch:** `main` (the SessionStart hook prints live state). Rewrite this file; never append. Under 500 words.

## Objective
A local-first usage, cost and quality tracker for Claude Code that a teammate installs in minutes,
whose numbers can be trusted, and which costs zero tokens in the sessions it measures.

## What is done and verified
- **M1 (core + recorder)** and **M2 (dashboard + status line)** are built; tags `m1`, `m2`.
  139 tests pass on 2026-10-15 (unit, golden fixtures from 5 Claude Code versions, server, CLI, plugin
  scripts, a happy-dom smoke test that route changes keep the dashboard mounted).
- **Installed on the user's machine** (2026-10-14) from this checkout; live hook recording and `/ccmeter`
  verified headlessly. Interactive behaviour not yet reported back by the user.
- **Accuracy:** on the user's corpus, 306 of 310 sessions with a Claude Code `cost-state` entry match it
  token-for-token; prices for Sonnet 5.5, Haiku 4.5 and Opus 5.5 reproduce Claude Code's own costs.
  The four mismatches and their causes: `docs/FORMATS.md` → Known discrepancies.
- **Context harness** for working on this repo (this document, handoff, hooks, rules, skills, checks,
  verify loop, skills incl. `react-check`): `docs/harness.md`. Tags `m1`, `m2` and `main` are on GitHub
  (pushed by the user; see `git status -sb` for unpushed commits).
- **Review fixes of 2026-10-15 are done** (six commits, `docs/status.md`); built and live, `doctor` 0 warnings.

## Open
- The user is trying ccmeter and will report; their read-through questions are pending.
- Decided 2026-10-15 (`docs/decisions/0007-*`): compliance parameters (local-only, accurate, MIT), `node:sqlite`,
  M3 judge via `claude -p`; unpriced models handled per `0008-*` (prompt, Claude Code's figure, derived price).
  Command file `/ccmeter:ccmeter` kept (≈16 tokens per session; owner, 2026-10-15).
- Unverified: interactive `/ccmeter` rendering, async Stop hook in interactive sessions, live statusLine
  payload, `advisorModel` billing, fast mode, web-search billing.
- M3 (digest, heuristics, judge, review overhead) is designed only: `docs/ARCHITECTURE.md`.

## Retrieve on demand
[Usage](USAGE.md) · [Formats](FORMATS.md) · [Architecture + M3 design](ARCHITECTURE.md) ·
[Assumptions](ASSUMPTIONS.md) · [Acceptance](ACCEPTANCE.md) · [Status](status.md) ·
[Decisions](decisions/) · [Lessons](memory/lessons.md) · [Harness](harness.md) · [References](references.md)
