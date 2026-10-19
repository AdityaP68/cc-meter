# Active task handoff

**Updated:** 2026-10-19
**Branch:** `main`. Milestones `m1`, `m2` tagged and pushed. Alpha is wrapped up; the owner continues inside a company environment.
History of earlier hand-offs: `git log -p -- docs/handoff.md`.

## Where things stand
2026-10-19: the name is **ccmeter** again (ADR 0012; agent-lens and sessionscope are read as fallbacks). The dashboard has the
Anthropic-style look (ivory/slate/clay, serif headings, system fonts only). `npm run verify` passes (245 tests); dashboard checked
on fixture data in light, dark and 375 px, no console errors. M3 reviewer and the Docs section are merged.
**Cutover done 2026-10-19 (owner approved):** old `~/.ccmeter` moved to `~/.ccmeter.old`, `npm run build`, `ccmeter setup` copied
`~/.agent-lens` to `~/.ccmeter`, replaced `agent-lens@agent-lens` with `ccmeter@ccmeter` (enabled, read from `plugin/`), backfilled
4 sessions. Real `doctor`: 0 errors, 2 warnings (Claude Code 2.1.299/2.1.302 unverified -> `format-drift`; 4 unknown entry types).
No status line is configured in `~/.claude/settings.json` (setup only adds one on `--statusline`). `/ccmeter` appears in a NEW
Claude Code session; interactive rendering is still unverified.

## Cutover (done; kept as the record of what was run)
1. `mv ~/.ccmeter ~/.ccmeter.old` (a pre-rename copy lives there; setup skips the copy while `~/.ccmeter` exists).
2. `npm run build`, then `node dist/cli/index.js setup` (copies `~/.agent-lens` to `~/.ccmeter`, replaces the plugin and status line).
3. `node dist/cli/index.js doctor`; `npm unlink -g agent-lens` / `npm link` if an old global command exists (a stale global
   `ccmeter` symlink from 2026-10-14 is on PATH today; the plugin tests no longer depend on it).

## Next
Priority order, for the company environment.

1. **Live check**: open a new Claude Code session and confirm what is still unverified: `/ccmeter`
   rendering, async Stop hook, live statusLine payload.
2. **Company-environment readiness** (decide before moving code): licence and repo ownership, package name/trademark check
   (npm free on 2026-10-19 only for earlier names; `ccmeter` not checked), where transcripts and `~/.ccmeter` may live on managed
   machines, and whether `claude -p` reviews (M3) are allowed to send prompt text off the machine. Keep the no-network and
   no-stored-text invariants (docs/SCOPE.md) unless policy changes them in a new ADR.
3. **Accuracy first**: `format-drift` for Claude Code 2.1.302 (doctor warns 2.1.302 > verified 2.1.295); re-run the 306/310
   `cost-state` comparison on the company machines' transcripts; the 4 known mismatches are in docs/FORMATS.md.
4. **Docs sweep**: `docs/guide/*` predates M3 (add a Reviewing page; the guide still says "not released"), re-run the fact-check
   against the code, date the survey numbers marked "date not recorded". Documented oddities to fix in code: all-unpriced session
   prints `$0.000+unpriced`; `--url-only` is not a registered switch; `report --by <bad>` silently lists sessions;
   `setup --uninstall` prints success if `claude` failed.
5. **M3 follow-ups**: dashboard review view; the first review's older `judge` folder stays untagged; skill `$ARGUMENTS`/`!`
   expansion is unverified; ADR 0009 O3 (precision gate 85 %, gold-set labeller) is the owner's call.
6. **Team layer** (Scope v2, ADR 0009, GAPS.md): no code yet; gated. No per-developer leaderboards, ever.
7. **Design follow-up**: the series colours were picked by eye (no contrast validator run); run one, and check the dark theme
   on real data. Display fonts are system serif (Georgia fallback), by design (no network).
8. Deferred by the owner (2026-10-19): **anything OTel** (audit command, OTel receiver, interactive OTel run). Do not start.
9. Owner-only: rename the GitHub repo and local folder, delete `~/.ccmeter.old`, `~/.agent-lens`, `~/.sessionscope` when satisfied.
   Agents may `git push origin main` (since 2026-10-19); never force-push or publish without asking.

Verify loop: `npm run verify` (or `-- --changed`). Read docs/current.md before substantial work; retrieve other docs by grep.
