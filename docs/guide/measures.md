# Measures

The vocabulary used across the dashboard, the CLI and these docs. Everything here is derived from Claude Code's transcript files; nothing is read from a server.

## Session

One Claude Code conversation, identified by its transcript file name (the session id). The session's totals include its subagents' transcript files. Sessions can come from the terminal CLI, the Claude desktop app (entry point `claude-desktop`) or headless `claude -p` runs; all three write transcripts of the same kind, which is what sessionscope reads. Whether the plugin's hooks fire inside the desktop app is not verified; the transcripts are picked up by a rescan either way. The `entrypoint` recorded for a session is `cli`, `claude-desktop` or `sdk-cli`.

## Message

One API response from the model, as written in the transcript (the dashboard calls them "API messages"). Claude Code (observed on 2.1.236 to 2.1.295) writes one transcript line per content block, all with the same message id, so sessionscope keeps **one message per id** and the last copy wins. See [Costs](costs.md). Error placeholders (`<synthetic>`) are ignored.

## Turn

One real human prompt. Tool results, slash-command echoes, injected reminders, compaction summaries and task notifications are not turns. A message belongs to the turn it follows; messages before the first prompt are turn 0, and subagent messages go to the turn their timestamp falls in. The exact rule is in `docs/FORMATS.md` (section "User entry and the definition of a turn").

## Token kinds

Each message reports four counts, and sessionscope keeps all of them separately:

| Kind | Meaning |
|---|---|
| Input | New prompt tokens sent to the model, not served from cache |
| Output | Tokens the model generated |
| Cache read | Prompt tokens served from the prompt cache; cheap per token and usually the largest number |
| Cache write | Tokens written into the cache. Split into **5-minute** and **1-hour** by the cache lifetime Claude Code requested |

"Tokens" in the dashboard is input + output + cache read + cache write.

## Cost

The estimated list-price cost of the priced messages. It is an estimate, not a bill. See [Costs](costs.md).

## Unpriced

A model with no entry in the price table. Its messages have cost `NULL`, not $0, and are left out of every total. The cost is shown with a **+ unpriced** chip, the dashboard shows a banner naming the model, and `sessionscope doctor` lists it. Claude Code's own figure for that model, where it recorded one, is shown beside the cost and never added to it.

## Models

Every model that produced a message in the session, with its own totals. The session page has a per-model table; the Sessions list shows a bar of the mix. Each of the best-known Claude models has a fixed colour in the charts; any other model is grey.

## Model switch

The main conversation changed model between two consecutive messages (for example with `/model`). **A subagent running a different model is not a switch**, because subagent messages are tagged separately. Each switch is listed with its time and turn on the session page.

## Compaction

Claude Code summarised the conversation to free context, automatically near the limit or with `/compact`. The session page lists each one with its trigger (`manual` or `auto`) and the context size before and after, as Claude Code reports them.

## Subagent ("sub n")

Work done by a subagent (the Agent tool) in its own transcript file. The **sub n** chip on a session row is the number of API messages that came from subagents. Their cost is included in the session total and shown as hatched segments in the per-turn chart.

## Project

The last folder name of the session's working directory (`my-repo` for `/work/my-repo`). The full working directory is stored too; see [Privacy](privacy.md). Sessions with no recorded directory appear under "(unknown)" in the project rollup.

## Duration

The time between the first and the last timestamp in the session's files. It is elapsed wall-clock time, so a session left open overnight has a long duration. It is not active time.

## Title

The name Claude Code wrote for the session: either a name you gave it (`custom-title`) or one Claude Code generated from the conversation (`ai-title`); the first wins. Most sessions have none (586 of 613 surveyed on 2026-10-15), and in that survey no headless `claude -p` session on Claude Code 2.1.264 or later had one. A title can therefore reflect what you worked on. For untitled sessions the dashboard shows a label built from the entry point, the highest-cost model and the turn count, for example "desktop session · sonnet-5-5 · 12 turns". It is never built from prompt text.

## Where each measure is shown

| Measure | Dashboard | CLI |
|---|---|---|
| Cost, tokens | Sessions (cards, cost per day, table), session page (cards, per model, per turn), Rollups (by day, project, model) | `report`, `export` |
| Turns, duration | Sessions table; session page header and cards | `report` |
| Models | Sessions table (mix bar and names), session per-model table, Rollups by model | `report --by model` |
| Switches, compactions | Chips in the Sessions table; session event list and chart markers | `report --session` |
| Subagents | "sub n" chip; hatched bars and cards on the session page | `report --session` |
| Unpriced | Chip, banner on every page, session per-model table | first line of `report`, `doctor` |

Pages: [Sessions](#/), [Rollups](#/rollups), [Health](#/health). A session page opens from a title in the Sessions list.
