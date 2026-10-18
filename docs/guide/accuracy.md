# Accuracy

sessionscope's numbers are only as good as what it can check. This page explains what is compared with what, how well they agree, why they sometimes do not, and what no check here can catch. Numbers about the author's own data are dated and aggregate; yours will differ.

## The accuracy model

sessionscope has two sources of truth on your machine:

| Source | What it is |
|---|---|
| **Transcript usage** | The token counts Claude Code writes for each API response, priced with the [price table](costs.md). This is what sessionscope's totals are built from. |
| **`cost-state`** | An entry Claude Code writes into the same transcript with its own per-model token totals and `costUSD`. sessionscope uses it only as a cross-check and never as a source of totals. |

Both come from Claude Code. **A match shows sessionscope read the transcript correctly and its prices reproduce Claude Code's cost. It does not show that Anthropic billed you that amount.** There is no invoice or provider data in the loop.

> **Limit:** for interactive sessions there is no third, independent source. The Health page says this in so many words.

## What "match" means

A (session, model) pair **matches** when all four token counts are identical: input, output, cache write and cache read. Cost is not part of the match test; prices are checked separately (below). A session matches when every model in it matches. If the transcript has a model that `cost-state` lacks, or the other way round, that is a mismatch.

Dated results on the author's corpus:

- **2026-10-14:** 306 of 310 sessions that have a `cost-state` entry matched exactly (`docs/ACCEPTANCE.md`).
- **2026-10-15, Claude Code 2.1.281 to 2.1.295:** of 316 sessions with a `cost-state` entry, 308 matched exactly. In 7, Claude Code's tokens were at least sessionscope's in every class (class 1 below); in 1, `cost-state` covered less than the transcript (class 3) (`docs/FORMATS.md`).

> **Limit:** read these rates with their composition in mind. Nearly all matching sessions were short headless `claude -p` runs, and all the mismatches were interactive desktop sessions. The data cannot tell "interactive" from "desktop app". The headline rate therefore says less about long interactive sessions than it appears to. Sessions with no `cost-state` entry cannot be checked at all; whether the entry is written does not follow the Claude Code version (it was absent from all 62 sampled files of one version and present in nearly all of another).

## Why sessions differ: the known classes

A difference in either direction is information, not automatically an error. sessionscope shows both numbers and never silently picks one. The causes seen so far, with how well each is established:

### 1. Calls billed but never written to the transcript

In some interactive sessions Claude Code counts more input and cache tokens than the transcript contains, in every class and for every model. The extra calls have the signature of requests with large cached input and tiny output. Transcript entries in these sessions often carry a `serverClassifierRequest` field, so server-side classifier calls (a permission check, for example) are the **leading explanation, not a proven one**: the data confounds that field with "interactive desktop session". In one session a whole model appeared in `cost-state` that never appears in the transcript.

Where Claude Code's record provably covers the whole session, sessionscope shows an **estimate** of the missing cost: Claude Code's cost minus its own, with the output tokens of mid-stream replies (class 2) left out. It appears as a `≈ $x not in transcript` chip and a banner on the session page. It is derived from Claude Code's figures and **not added to sessionscope's cost**. If the difference involves a model sessionscope cannot price, no estimate is shown. On 2026-10-15 the raw gap in the 7 affected sessions was $32.28 in total; the estimate is smaller because it removes mid-stream output.

### 2. Subagent output saved mid-stream

In subagent transcripts about four in five final messages (1,179 of 1,492 in one survey; 0 of 5,835 in main transcripts) were written before their final output count: the saved `output_tokens` is a small snapshot and `stop_reason` is `null`. Input and cache counts are normal; only output is understated. It is not an aborted-session artifact, it depends on the tool in the message's last content block (almost always `Bash` or the subagent's hand-back), and it still occurred on the newest versions surveyed. The real count is not in the transcript, so sessionscope **cannot recover it**. Claude Code's `cost-state` has it.

sessionscope marks such sessions with the **`≥ lower bound`** chip and banner. The cost shown is a floor for the session. Where `cost-state` covers the whole session, the banner also gives Claude Code's output count and its list-price value, which is not added to the cost. *Why the transcript writer behaves this way is a hypothesis and is not verified.*

### 3. `cost-state` covers less than the transcript

In sessions that span several Claude Code processes (resumed, or very long), `cost-state` can restart or restore only part of the history, so its totals sit **below** sessionscope's. On 2026-10-15 one multi-week session showed one model at $676.12 in sessionscope against $4.69 in Claude Code. The transcript messages are real API responses, so here sessionscope's figure is the more complete one. The session page shows a `Claude Code's record is partial` banner, and the Sessions list shows no `CC` chip for it, because a partial record's total is not the session's cost.

### 4. Transcripts with no API call (not an error)

Some transcripts hold only `<synthetic>` error entries (236 on 2026-10-15, 231 of them with a `cost-state` total of 0). The recorder skips them, and `doctor` counts them as "no API calls".

## The chips on the Sessions list

| Chip | Meaning |
|---|---|
| `≥ lower bound` | Some replies were saved mid-stream, so output tokens and cost are a floor |
| `≈ $x not in transcript` | Estimated cost of calls Claude Code billed but never wrote down (class 1) |
| `CC $x` | Claude Code's total differs from sessionscope's by more than 5%, its record covers the whole session, and no hidden-calls estimate was made |
| `+ unpriced` | A model without a price was left out of the cost |

## The accuracy report on the Health page

The [Health page](#/health) opens with an **Accuracy report** computed over all recorded sessions. Each line means:

| Line | How it is computed |
|---|---|
| "N of M sessions with a Claude Code cost record match it exactly" | M is the sessions with a `cost-state` entry; N those where every model's four token counts are equal. The percentage is rounded down. The line under it counts (session, model) pairs the same way. |
| "calls Claude Code billed but never wrote to the transcript" | Sessions that differ, where Claude Code's tokens are at least sessionscope's everywhere and a hidden-calls estimate exists. It shows the summed estimate and its share of sessionscope's total cost. |
| "Claude Code's record covers only part of the session" | Sessions that differ where `cost-state` lacks a model sessionscope saw, or counted fewer tokens than the transcript in some class. |
| "differ without a known explanation" | Sessions that differ and fit none of the above (for example an unpriced model). Shown as a warning. |
| "no Claude Code cost record" | Sessions without a `cost-state` entry; they cannot be cross-checked. |
| "Prices: x of y comparisons" | See price checks below. |
| "Unpriced" | Models without a price and the tokens they account for. |
| "recorded from a Claude Code version outside the verified range" | Sessions whose parser status is not `verified`. |

The four classes (exact, hidden calls, partial record, unexplained) are checked in that order and add up to the sessions with a `cost-state` entry.

## Price checks

`sessionscope doctor --verify-pricing` (also the table on the Health page) feeds Claude Code's own token counts through the price table and compares the result with the `costUSD` Claude Code recorded. Because `cost-state` does not split cache writes by lifetime, the table predicts a **range**: all cache writes at the 5-minute rate (low) to all at the 1-hour rate (high). A comparison is **consistent** when Claude Code's cost falls inside that range, give or take half a cent. A second, stricter test applies to sessions whose tokens match exactly: sessionscope's own cost, which knows the real 5m/1h split, is compared with Claude Code's, and the largest error is shown. Pairs where Claude Code recorded no cost are skipped.

Results on the author's corpus (2026-10-14, `docs/ACCEPTANCE.md`): Sonnet 5.5, 299 of 299 sessions in range and 297 exact to under $0.00001; Haiku 4.5, 10 of 10; Opus 5.5, 3 of 3. Opus 5 had one session and is list price only. Every other model in the table is a published list price that was never compared with a Claude Code cost on a real interactive session; the one exception is Haiku 5.5, which only the single OpenTelemetry run below checked. Fast mode, web-search billing and long-context pricing have never been exercised on real data.

## The OpenTelemetry test (2026-10-18)

To get a source independent of `cost-state`, one paid run was made on 2026-10-18 with Claude Code 2.1.302 in headless mode (`claude -p`, Haiku 5.5, one Bash call and one subagent, about $0.0074), exporting Claude Code's OpenTelemetry events to a throwaway local receiver. All four API calls matched sessionscope's per-message tokens, including the 5m/1h cache split, and cost exactly. The totals equaled `cost-state` and the CLI's reported `total_cost_usd`.

**What it proves:** for that shape of run, the transcript lost nothing and the Haiku 5.5 prices reproduce Claude Code's cost.

**What it does not prove:** it was one tiny non-interactive run, with no classifier or other hidden call, so it says nothing about the interactive gap in class 1. Whether OpenTelemetry would show those extra calls is still open. It is also still Claude Code reporting on itself, not an invoice. sessionscope does not use OpenTelemetry; no receiver is built in.

## Format drift and the verified version range

sessionscope reads a format Claude Code does not promise to keep. It copes in three ways:

- **Parser by transcript version.** The parser is chosen from the version recorded inside the transcript, not from `claude --version`. At the time of writing the parser's verified range is Claude Code 2.1.236 to 2.1.295 (`verifiedRange` in `core/parser/cc21.ts`; `sessionscope doctor` prints the current range). Versions inside it are `verified`. Other 2.1.x versions are still parsed but marked `unverified-newer` or `unverified-older`; others fall back to the newest parser (`fallback`) or have no version (`no-version`).
- **Unknown shapes are counted, not hidden.** Unknown transcript entry types and unknown `usage` fields are counted per session, and `doctor` lists them. A new billable token kind would show up there. Across 17 Claude Code versions on the author's corpus the parser met no unknown entry types and no unparsable lines.
- **A warning, not silence.** `doctor` and the Health page warn when your installed Claude Code or a recorded session is outside the verified range. Recording continues.

> **Note:** the OpenTelemetry run above used Claude Code 2.1.302, which is above the verified range as of this writing, so sessions from that version are labelled unverified even though that run agreed exactly.

## What could make a number wrong without detection

- **A release that keeps every field name but changes its meaning.** Unknown-field counting cannot see this. The golden test fixtures and `--verify-pricing` are the only guards.
- **Both sources wrong the same way.** `cost-state` and the transcript both come from Claude Code. A call missing from both is invisible.
- **Sessions with no `cost-state` entry.** Nothing cross-checks them. Only the `≥ lower bound` chip can reveal mid-stream output.
- **List prices that were never verified, and your real rate.** Most models are list-only, and your plan, discounts or credits may change what you pay.
- **Unverified billing features.** Fast mode, web search, long-context pricing, and what `advisorModel` (present on a large share of assistant entries) bills as.
- **A session still in progress.** Recording happens at the end of a turn and a session; a hook sees a transcript that can lag. A running dashboard rescans every 30 seconds, and the next recording repairs it.
- **Day boundaries.** Costs are split by your local time zone; change zones and the same message can land on another day.

> **Unverified:** the interactive behaviour of the asynchronous `Stop` hook, the live status line payload, and whether OpenTelemetry sees the extra calls in class 1 (see `docs/FORMATS.md`, "Not verified").

If a figure matters (an expense report, a budget), compare it with your provider's usage page. sessionscope is for seeing where usage goes, not for settling an invoice.
