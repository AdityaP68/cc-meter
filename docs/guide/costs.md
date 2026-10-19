# Costs

Every dollar figure in ccmeter is an **estimate at list price**, computed locally from the token counts in your transcripts. It is not your bill. This page describes exactly how it is computed and where it can differ from what you are charged.

## The formula

For each API message:

```
cost = ( input         x input rate
       + output        x output rate
       + cache read    x cache-read rate
       + cache write 5m x cache-write-5m rate
       + cache write 1h x cache-write-1h rate ) / 1,000,000
```

- Rates are USD per million tokens and come from the price table (`pricing.json`), looked up by model id. A dated id such as `claude-haiku-4-5-20251001` falls back to the undated entry.
- Cache writes have two rates. Each message's usage says how many of its cache-write tokens were written at the 1-hour lifetime; the rest are priced at the 5-minute rate. ccmeter uses that per-message split and does not assume one tier.
- Two optional adjustments exist in the price table: a **fast-mode multiplier** (applied when a message reports `speed: "fast"`) and **web search** at a flat price per request. A model can also carry a **long-context** rate that applies when a single request's prompt (input + cache read + cache write) exceeds a threshold. **None of the three has ever been exercised on real data**, so their prices are list-only and unverified.

## One message, counted once

- Claude Code (observed on 2.1.236 to 2.1.295) writes several transcript lines for one API response (one per content block), all with the same message id. ccmeter keeps **the last entry per message id**, because earlier copies can carry partial token counts. In the corpus survey recorded in `docs/FORMATS.md` (date not recorded for this count), the last copy had the maximum output count in all 5,102 duplicate groups checked.
- A message id is billed once, wherever it shows up: if it appears in both the main transcript and a subagent file, it is counted once.
- Placeholder messages for API errors (`model: "<synthetic>"`) are ignored.

## Subagents

Subagent messages are priced the same way and **included in the session total**. They are tracked separately so the session page can show them as hatched segments and so a subagent on another model is not counted as a model switch. Claude Code's own accounting also includes subagent usage (verified on a real session, `docs/FORMATS.md`).

> **Limit:** the transcript is often incomplete for subagents. About four in five final subagent messages (1,234 of 1,550 on the author's corpus, re-checked 2026-10-15; 0 of 6,690 in main transcripts) were saved before their output count was finalised, so their output tokens, and therefore their cost, are understated. ccmeter flags these sessions with a `≥ lower bound` chip and never guesses the missing tokens. See [Accuracy](accuracy.md).

## Price sources

Each model in the price table has a `basis`:

| Basis | Meaning |
|---|---|
| `verified` | The rates, applied to Claude Code's own token counts, reproduce the cost Claude Code recorded for the same sessions |
| `list` | Taken from published list prices, not compared with Claude Code's costs across your sessions (Haiku 5.5 matched on one tiny headless run only) |
| `derived` | Fitted from Claude Code's own figures by `ccmeter doctor` and pasted in by you |

In the price table dated 2026-10-14, `claude-sonnet-5-5`, `claude-haiku-4-5` and `claude-opus-5-5` are `verified`; every other model is `list`. The evidence behind `verified` and how to repeat it is on the [Accuracy](accuracy.md) page. Run `ccmeter doctor --verify-pricing` (see [Command line](cli.md)) to see the comparison on your own sessions, or open the [Health page](#/health).

You can add or override a model in `~/.ccmeter/pricing.json`, with the same shape as the repo's `pricing.json` (file format and fields: [Configuration and pricing](config-and-pricing.md)). Entries with a missing, negative or non-numeric rate are ignored and reported by `doctor`. When the effective price table changes, each session is re-costed the next time it is recorded (`ccmeter record --all`).

## Unpriced is never $0

If a model is not in the price table, its messages get cost `NULL`:

- They are left out of every dollar total, and their tokens still count in token totals.
- The cost is shown with a **+ unpriced** chip; a banner on every dashboard page names the model; the status line shows `⚠ unpriced: <model>`; `ccmeter report` prints a notice first; `doctor` lists the model with its message and token counts.
- Where Claude Code recorded its own cost for that model, the session page and Health page show it **labelled as Claude Code's figure**. It is never added to ccmeter's totals.

**Derived-price suggestion.** For an unpriced model, `ccmeter doctor` tries to fit input, output, cache-read and cache-write rates from Claude Code's own per-model figures (least squares). It needs at least four sessions with a Claude Code cost for that model, every token kind present, and varied token mixes; otherwise it refuses and says why. If it succeeds it prints the sample count, the largest error and a JSON snippet with `"basis": "derived"`. **It never writes the price for you.** Because Claude Code does not split cache writes by lifetime, the derived price has one blended write rate for both 5 minutes and 1 hour. Prefer the published price when you have it.

## Which day does a cost belong to?

Costs are bucketed **per message**, by the message's timestamp in your machine's local time zone. A session that runs past midnight is split across two days in "Cost per day" and in the day rollup. The model rollup also sums messages, so a session that used several models is split across them.

The session rows in the Sessions list, by contrast, show the **whole session**, so a session that began before the selected range can cost more in its row than it contributes to the range totals above.

## Where ccmeter's number can differ from what you pay

| Cause | Direction | Page |
|---|---|---|
| Subscription, discounts, credits, taxes are not modelled | either | here |
| Claude Code billed calls that never became transcript messages | ccmeter lower | [Accuracy](accuracy.md) |
| Subagent output saved mid-stream | ccmeter lower | [Accuracy](accuracy.md) |
| Model has no price | ccmeter lower (left out) | here |
| List price differs from the rate you are actually charged | either | here |
| Fast mode, web search, long-context pricing | unverified | here |

> **Note:** ccmeter can only see what Claude Code writes to its transcripts. It has no access to your provider invoice.
