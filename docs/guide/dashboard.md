# Dashboard

The dashboard is a local web page served by ccmeter on `127.0.0.1`. It reads the database in `~/.ccmeter` and makes no network calls. Open it with `/ccmeter` in Claude Code or `ccmeter serve --open` in a shell (see [Status line and /ccmeter](statusline-and-command.md) and [Command line](cli.md)).

| Page | Address | What it answers |
|---|---|---|
| Sessions | `#/` | What did my sessions cost, and which ones stand out? |
| Rollups | `#/rollups` | Where does the cost go by day, project or model? |
| Session detail | `#/session/<id>` | What happened in this session, turn by turn? |
| Health | `#/health` | Can I trust these numbers, and is anything misconfigured? |
| Docs | `#/docs` | This documentation, built into the dashboard. |

## The page header

- **ccmeter** (left) returns to the Sessions page. **Sessions**, **Rollups**, **Health** and **Docs** switch pages. The session detail page is part of Sessions.
- A **⚠ n** badge on Health appears when there are warnings or errors. Hover it for their titles.
- **local only** is a reminder that the server listens on `127.0.0.1` and nothing leaves your machine.
- **Refresh** rescans your transcripts (the same work as `ccmeter record --all`) and reloads the page. The button reads "Refreshing…" while it works. The server also rescans by itself every 30 seconds.
- **Theme: system / dark / light** cycles system, dark, light. Your choice is kept in the browser.

## Filters

The Sessions and Rollups pages show four filters. They apply to the cards, the charts and the tables on that page, and your selection is remembered in your browser (not on the server).

| Filter | Options |
|---|---|
| Range | Last 7 days, Last 30 days (default), Last 90 days, All time. It selects messages by their timestamp. |
| Project | The name of the working-directory folder each session ran in. Options come from your data. |
| Model | A model seen in your data. |
| Source | Where a session came from. Every session is `claude-code` today; no other source exists. |

The session detail and Health pages ignore the filters.

## Banners

Two banners can appear above any page.

| Banner | When | What to do |
|---|---|---|
| "⚠ No price for `<models>`." Costs are left out of every total (never counted as $0). | A recorded model has no price. | Add a price to `~/.ccmeter/pricing.json`, or open Health for a suggested one ([Configuration and pricing](config-and-pricing.md)). |
| "⚠ n health warnings:" followed by the titles. Red if any check is an error. | Any check from `ccmeter doctor` is a warning or error (the unpriced check is not repeated when the first banner is showing). | Click "Details" to open Health. Not shown on Health itself. |

Other short messages: "No sessions match. Run `ccmeter record --all` to backfill.", "No usage in this range.", and, on the session page, "Could not load this session" with a Back link.

## Sessions page

Five cards summarise the filtered range:

| Card | Meaning |
|---|---|
| Estimated cost | List-price estimate from token usage. A `+ unpriced` chip means some tokens belonged to a model with no price and are **not** in the number. |
| Tokens | Input plus output plus cache reads plus cache writes. Cache reads usually dominate and are cheap per token. |
| Sessions | Sessions with activity in the range, with a count per source underneath. |
| Model switches | Changes of model in the main conversation, summed. |
| Compactions | Times a conversation was summarised to free context, summed. |

Definitions of every measure are in [Measures](measures.md); how the dollar figure is computed is in [Costs](costs.md).

### Cost per day

A stacked bar chart, one bar per day, split by model. Days use your local time zone, and a message belongs to the day of its own timestamp, so a session running past midnight is split. Hover a bar for the day's total and each model's share. **Show as table** swaps the chart for the same data as a table (Day, Model, Tokens, Cost); **Show chart** swaps back. The chart draws at most the last 180 days; the table lists every day in the range.

### Sessions table

Sort with **Most recent**, **Highest cost** or **Most tokens**. The table shows 50 rows; **Show more** adds 100. Columns:

| Column | Meaning |
|---|---|
| Started | Local date and time of the first message. |
| Project / title | The session title as Claude Code wrote it (click it to open the session page), with the project folder below. Untitled sessions show a label built from the entry point, model and turn count, such as "headless run · sonnet-5-5 · 1 turn". |
| Turns, Duration, Tokens, Cost | As in [Measures](measures.md). |
| Models | A bar showing each model's share (of cost, or of messages when nothing is priced) and the model names. Hover the bar for the figures. |
| Flags | Chips that mark anything unusual; a dash means nothing to flag. |

Each row shows the **whole** session. A session that began before the range, or that also used other models, therefore costs more in its row than it adds to the cards above.

### Flags and chips

Every chip is a small button. Hover it, focus it with the keyboard or tap it to read its explanation; Escape or a tap elsewhere closes it.

| Chip | Meaning |
|---|---|
| `⇄ n` | The main conversation changed model n times (for example with `/model`). Subagents are not counted. Prompt caches are per model, so the first reply after a switch normally writes the context to the cache again (this comes from how Claude's prompt caching works, not from anything ccmeter measured). |
| `◆ n` | The conversation was compacted n times, automatically or with `/compact`. The session page lists each with its context size before and after. |
| `sub n` | n API calls came from subagents. Their cost is included in the total and shown hatched on the session page. |
| `≥ lower bound` | Some replies were saved mid-stream before their final token count was written, so output tokens and cost are understated. Never filled in with a guess. |
| `≈ $x not in transcript` | An estimate of calls Claude Code billed but never wrote to the transcript, derived from Claude Code's own total. Not added to the cost. Shows "< $0.01" for small amounts. |
| `CC $x` | Claude Code's own total for the session differs from ccmeter's by more than 5%, its record covers the whole session, and no estimate above was made. |
| `+ unpriced` | Tokens of a model with no price are left out of this cost. Appears next to any cost figure, in every table and card. |
| a source name | A small badge under the project when the session's source is not `claude-code`. |

The causes behind `≥`, `≈` and `CC` are explained in [Accuracy](accuracy.md).

## Rollups page

Totals grouped **By day**, **By project** (the default) or **By model**. Rows are sorted by cost, highest first (newest day first for By day). A bar chart shows the first 25, and a table lists every row with Sessions, API messages, Tokens and Cost. The figures come from individual messages, so a session that spans several days or models is split across them. A `+ unpriced` note marks rows that include a model with no price. Models use the same fixed colours as the charts.

## Session detail

Open it by clicking a title. It has these parts, top to bottom:

1. **Header.** Title (or label), working directory, start and end times, duration, the Claude Code versions seen, a **parser** badge and a **source** badge. The parser badge reads `verified` when the Claude Code version is inside the range ccmeter was checked against; any other value (`unverified-newer`, `unverified-older`, `fallback`, `no-version`) is shown in amber. The session id follows.
2. **Cards.** Estimated cost (with Claude Code's own figure underneath), Tokens (in and out), Cache (read, and written), Turns (with API message and subagent counts) and Switches / compactions.
3. **Notes**, only when relevant. "⚠ Unpriced" names models left out, and shows Claude Code's own figure for them. "ℹ Claude Code's record is partial" says Claude Code's total covers only part of the session, so ccmeter's complete total is the one to use. "ℹ Calls not in the transcript" gives the estimate behind the `≈` chip. "ℹ Lower bound" explains the `≥` chip.
4. **Cost per turn** (below).
5. **Models.** One table with a row per model: Messages, Input, Output, Cache write, Cache read, Cost.
6. **Events**, if any. Each model switch ("switched A → B") and compaction ("compaction (manual or auto): context before → after") with its time and turn.
7. **Check against Claude Code's own accounting** (below).

### Reading the Cost per turn chart

Each bar is one turn: one user prompt and everything done in response.

- Bar height is that turn's cost. Bar colour is the main-thread model. The legend above is the key; the eight best-known models keep a fixed colour, and any other model (for example an older Opus or Sonnet) is neutral grey.
- A **hatched** segment on top of a bar is subagent cost.
- A dashed line topped by a `▼` is a model switch, labelled "→ model". A solid line topped by a `◆` is a compaction, labelled "compact".
- A `?` at the foot of a bar means that turn had tokens from an unpriced model.
- Hover a bar: Cost, of which subagents, Cumulative, Tokens, API messages, Models, and Unpriced tokens when present. Hover a marker: for a switch, From, To, At and Turn; for a compaction, Context before, After, At and Turn.
- **Show as table** gives the per-turn table (Turn, Time, Messages, Tokens, Subagent cost, Cost, Models) for screen readers or exact figures.

### The reconciliation table

"Check against Claude Code's own accounting" compares ccmeter with the per-model totals Claude Code writes into the same transcript (its `cost-state` entry). For each model there are up to three rows:

| Row | Content |
|---|---|
| ccmeter | Input, Output, Cache write, Cache read and Cost as ccmeter counted them. An unpriced model shows an `unpriced` badge instead of a cost. |
| Claude Code | The same four counts and Claude Code's own cost, if it recorded that model. |
| `✔ match` or `ℹ difference` | `match` means all four counts are equal. Otherwise the row shows the difference per class, ccmeter minus Claude Code, so a negative number means Claude Code counted more. |

Equal counts mean ccmeter read the transcript correctly. A difference means one side sees calls the other does not; ccmeter never silently prefers either number. See [Accuracy](accuracy.md) for the known causes. A model that appears only in Claude Code's entry and not in the transcript shows a ccmeter cost of `$0`: that means "no transcript data for this model", not that it was free. A session without a Claude Code entry shows no comparison rows and its cost card says "no Claude Code cost entry".

## Health page

Three sections, top to bottom.

- **Accuracy report.** How many sessions with a Claude Code cost record match it token for token, how many have calls Claude Code billed but never wrote down (with the estimated dollars and their share of the total), how many have a partial Claude Code record, how many differ without a known explanation (a warning), and how many have no Claude Code record at all. It also summarises price checks, unpriced models and sessions recorded from an unverified Claude Code version. It compares two sources on your machine; it does not compare with a bill. Line by line in [Accuracy](accuracy.md).
- **Health checks.** The same checks as `ccmeter doctor`, each with a level: ✔ OK, ℹ Info, ⚠ Warning or ✘ Error, and detail text beneath. The checks are listed in [Troubleshooting](troubleshooting.md).
- **Price table versus Claude Code's own costs.** One row per model you used: **Basis** (`verified`, `list` or `derived`, shown as a green, blue or amber badge), **Matches** (sessions where Claude Code's cost lands inside the range the table predicts), **Largest miss**, **Exact-token sessions** and **Max error (exact)**. A model with no Claude Code cost to compare shows "no Claude Code cost recorded to compare". The same table is printed by `ccmeter doctor --verify-pricing`; see [Configuration and pricing](config-and-pricing.md).

## Docs page

`#/docs` shows this documentation inside the dashboard. The same Markdown files live in `docs/guide/` in the repository and read the same on GitHub.

## What is and is not on screen

Titles and working directories are shown because they are stored (see [Privacy](privacy.md)). Prompt, reply and tool text is never stored, so it cannot appear anywhere. The server only accepts requests whose `Host` is `127.0.0.1`, `localhost` or `[::1]` on its own port, which stops other websites from reading it through your browser.
