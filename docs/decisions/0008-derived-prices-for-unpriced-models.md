# 0008 — Unpriced models: upfront prompt, Claude Code's figure, derived prices

**Status:** accepted 2026-10-15 (owner chose option 2 for keeping prices current).

**Context.** New Claude models ship often. An unknown model is unpriced (`NULL`, never `$0`, ADR 0005), and the
user only learned that from `doctor`. Prices may not be fetched online (ADR 0007: no network). Claude Code's own
`cost-state` entries carry per-model token totals and `costUSD`, so they hold local evidence about a new model's
price.

**Decision.**
- **Prompt up front:** a banner on every dashboard page, `⚠ unpriced: <model>` in the status line, and a first line in
  `sessionscope report`, each pointing at `~/.sessionscope/pricing.json` and `sessionscope doctor`. Never in the conversation.
- **Claude Code's figure:** the summed `costUSD` Claude Code recorded for the model is shown, labelled as Claude
  Code's, in Health/`doctor` and on the session page. It is never added to sessionscope's totals.
- **Derived price:** `doctor` fits input, output, cache-read and one cache-write rate by least squares over the
  model's `cost-state` entries (`core/derive.ts`). It needs ≥ 4 entries, every token type present and varied mixes;
  otherwise it refuses and says why. It prints the fit's largest error, the sample count and a JSON snippet with
  `"basis": "derived"`. sessionscope never writes it into a pricing file: the user pastes it.

**Consequences.** `derived` is a valid `basis` in `pricing.json` and shown in the Health table. `cost-state` does not
split cache writes by TTL, so a derived price has one blended write rate for both 5m and 1h; the published price is
preferred when it exists. A derived price is checked against Claude Code like any other (the Health table).
