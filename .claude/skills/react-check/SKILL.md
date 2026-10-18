---
name: react-check
description: Verify and review agent-lens's React dashboard (or another React 18/19 single-page app with a client-side router). Serves it on isolated data, clicks through every route looking for crashes and blank pages, greps for React pitfalls (expression-bodied or async effects, missing keys, missing cleanups, stale state across route params), checks dark, light and 375 px layouts, and reviews code quality, organisation, performance and the accuracy of displayed numbers. Use after UI changes, before a release, when a page goes blank or breaks after navigation, or when asked to check, test or review a React frontend. Not for React Native; for SSR frameworks only the browser steps apply.
---

# React check

Helpers live next to this file: `static-check.mjs`, `sweep.js`, `instrument-destroy.mjs` (Node ≥ 18, no
dependencies). In agent-lens, step 1 is `dashboard-check` steps 1–2 (a copy of the DB in a temporary
`AGENT_LENS_HOME`; never `~/.agent-lens`); elsewhere, use the project's own serving steps when it has them. Report every finding as `file:line`, severity, evidence; label anything you
did not reproduce as unverified.

## 1. Serve on isolated data

Never point the app, its dev server or its backend at the user's real data, production APIs or real config.
- Find how data reaches the UI (API proxy in `vite.config.*`, env vars, a local backend, mocks, fixtures).
- Use, in order of preference: the project's fixtures or seed data; a **copy** of a local database in a
  `mktemp -d` directory, pointed to by the app's home/data env var; the project's mock layer. Ports that do
  not collide with anything the user is running (check `lsof -iTCP:<port> -sTCP:LISTEN`).
- If none of these exists, stop and ask the user how to get safe data. Do not invent a backend.
- Typecheck and run the project's tests first (`npm run verify`, `npm test`, `tsc --noEmit`, whatever exists).
- Build or start the app (`vite`, `vite build && vite preview`, or the project's server) and open it in the
  browser pane. Prefer a production build for the sweep: some bugs only appear without dev-mode checks.
- Stop every server you started at the end, and reset the browser viewport.

## 2. Crash sweep (every route, the app's own links, no reloads)

1. Read console errors once on the start page (`read_console_messages`, errors only).
2. Paste `sweep.js` into the browser's JavaScript tool. It clicks each same-origin link (≤ 40 pages,
   ≤ 2 per route shape such as `/item/:id`), waits for the render, and returns per route: errors, a blank
   root (it stops there), a link the router did not handle (`wouldReload`: a plain `<a>` that would reload the
   SPA), and `sameAs` (two different params rendered identical text: a stale-state candidate). It then goes
   Back twice. `via: "direct"` means no link existed on that page and it used hash/pushState instead.
3. Read console errors again, and `read_network_requests` (kept for step 6).
4. Anything blank or erroring: go to step 4 before guessing. A fix is verified only when the sweep reruns
   clean **and** the route that failed renders its content (screenshot or `get_page_text`).
5. The sweep cannot fill forms, open menus or dialogs, or reach routes no link points to: list those and
   exercise the important ones by hand (click, type, submit on test data only).

## 3. Static pitfalls

Run `node .claude/skills/react-check/static-check.mjs dashboard/src` (another app: its source dirs).
`error` findings must be fixed or justified; `warn`/`info` are candidates to read in context. What it looks for, and why:
- **Expression-bodied effect** `useEffect(() => window.scrollTo(0, 0), [h])`: the expression is returned as
  the cleanup. React 19 calls it on the next re-run/unmount; `scrollTo` returns a Promise in current Chromium,
  React threw `destroy is not a function` and unmounted the whole app (agent-lens, 2026-10-15). Always use a block
  body. Same for `async` effect callbacks (they return a Promise): call an inner async function.
- **Missing cleanup**: listeners, intervals, timeouts, observers, sockets or subscriptions without a returned
  cleanup leak and fire after unmount (and twice under StrictMode in dev).
- **Fetch race**: an effect that applies an async result without an `AbortController`/`ignore` flag can show
  the previous route's data after a fast param change.
- **Stale state across route params**: `useState(props.id)`/`useState(params.x)` keeps the first value when
  the router reuses the component for `/item/a` → `/item/b`. Key the page by the param
  (`<Item key={id} id={id} />`) or derive the value instead of copying it into state. Cross-check `sameAs`.
- **Keys**: list items need stable keys from the data; `<>` in a list cannot take one (`<Fragment key>`);
  index keys break on reorder/filter.
- Also flagged: suppressed `exhaustive-deps` (stale closures) and `dangerouslySetInnerHTML` (trusted source?).
Read by hand as well (no reliable grep): effects that only compute derived state (`useEffect(() => setX(f(y)))`
→ compute during render or `useMemo`); state that duplicates props or server data; conditional hooks; refs
read during render; error boundaries (is there one per route, so one crash does not blank the whole app?).
agent-lens enforces the effect-body rule in `tests/dashboard.test.ts`; in another project, propose the same guard.

## 4. Debugging a crash or blank page

- Fastest: run the dev server and reproduce. React's development build warns "… must not return anything
  besides a function, which is used for clean-up" with a component stack, and names most other misuse.
- If it only fails in production, build **unminified into a scratch directory**, never over the real `dist/`:
  `npx vite build --minify false --sourcemap --outDir "$SCRATCH/unmin" --emptyOutDir` (add `--config` when the
  config is not at the root), then serve it with `npx vite preview --outDir "$SCRATCH/unmin"` (set
  `preview.proxy` if API calls 404) or the project's server pointed at that directory.
- For a bad effect cleanup, patch that build: `node .claude/skills/react-check/instrument-destroy.mjs "$SCRATCH"/unmin/assets/*.js`.
  It inserts, in React's `commitHookEffectListUnmount`, a `console.error` naming the component and the type
  of the non-function cleanup. Rerun the sweep; the log names the culprit.
- For other uncaught render errors: `createRoot(el, { onUncaughtError: (e, info) => console.error(e,
  info.componentStack) })` (React 19) in a scratch copy gives the component stack; unminified, names are real.
- Reproduce first, then fix, then add a test or static guard for the failure mode, then rerun the sweep.

## 5. Themes and phone width

For each of: dark (`resize_window` colorScheme dark), light, and the mobile preset (375 px), reload and look
at every main route with screenshots: contrast and legibility, charts and badges readable in both themes,
nothing clipped or overlapping, tap targets usable. If the app has its own theme toggle, test that too.
No horizontal page scroll at 375 px; this lists what sticks out (scroll containers excepted):
```js
const W = document.documentElement.clientWidth;
const clipped = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)) return true; return false; };
({ overflowPx: document.documentElement.scrollWidth - W, culprits: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > W + 1 && !clipped(e)).slice(0, 8).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} right=${Math.round(e.getBoundingClientRect().right)}`) })
```
Reset the viewport to desktop afterwards.

## 6. Review checklist

**Code quality**: types match the API (no `any` at the boundary); loading, error and empty states for every
fetch; no swallowed errors; no dead exports or leftovers (`void x`, commented-out code, `console.log`);
accessible names on controls, `aria-current` on nav, labelled inputs; readable JSX (no 300-character lines).
**Organisation**: one place per concern (API client, formatting, routing, shared components); pages do not
re-implement helpers; the same filter/query logic is not duplicated across files; components are small enough
to name; types shared with the backend are mirrored deliberately, not copy-drifted.
**Performance**:
- Bundle: read the build's size table; note the largest chunks (gzip) and heavy imports (a whole icon or date
  library for one function); suggest route-level `React.lazy` for large, rarely visited pages.
- Re-renders: context values created inline (`value={{…}}`) re-render every consumer; inline objects or
  callbacks defeat `memo`; state lifted too high; big lists without virtualisation. Measure before claiming:
  a temporary `<Profiler onRender>` or `console.count` in a scratch copy.
- Request fan-out (from step 2's network log): requests per route, duplicates, one request per table row
  (N+1), waterfalls that could run in parallel, polling intervals. Dev StrictMode doubles effects; judge on a
  production build.
**Accuracy** (numbers the user will trust):
- Headline totals use the **same filter semantics** as the charts and tables beside them (same time field,
  same WHERE clause, same inclusive/exclusive bounds). Check by summing the chart's series or table for the same
  window and comparing with the headline; agent-lens once showed a 7-day total one third of its chart's sum.
- Unknown is not zero: a missing price, rate or value renders as unknown, never `0` or `$0`.
- Units, rounding and time zones (day buckets local vs UTC); percentages that should sum to 100 do; totals are
  not computed from a paginated or truncated list; sort orders match their labels.
- Spot-check one displayed number end to end against the source data (the isolated copy), and say which.

## 7. Optional: DOM tests

A static guard catches one failure mode; a DOM smoke test catches the class. agent-lens has one:
`tests/dashboard-dom.test.ts` (happy-dom; real server on fixtures; clicks every route; `scrollTo` returns a Promise
as in Chromium; it failed with the 82bf4ae bug reintroduced). Extend it when adding a route. In another project,
**ask the user before adding dependencies** (each is a network install and a new devDependency): `vitest` (if absent), `happy-dom` or
`jsdom`, and optionally `@testing-library/react`. Proposed smoke test: render `<App />` with mocked `fetch`,
click every nav link inside `act()`, and assert after each that the root is non-empty and `console.error` was
not called. Write it only after the user agrees; until then, report that the app has no DOM tests.

## Unverified (2026-10-15)

`sweep.js` with history-API routers (pushState fallback, reload guard); `instrument-destroy.mjs` on React 18 or
other bundlers (it fails loudly if the function is missing); whether `vite preview` inherits `server.proxy`.

## Finish

Report: what was served and on which data, routes swept (count, failures), static findings by severity, theme
and 375 px results, review findings ranked, what was not covered. Fix only what the user asked for; propose
the rest.
