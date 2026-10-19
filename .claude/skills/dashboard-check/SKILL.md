---
name: dashboard-check
description: Visually verify ccmeter's dashboard after a UI or API change — builds it, serves it on an isolated copy of the data, and inspects dark, light and phone widths in the browser pane. Use after editing dashboard/ or server/, or when asked to check how the dashboard looks.
---

# Dashboard check

1. `npm run verify` (typecheck both projects), then `npm run build:dashboard && npm run build:cli`.
2. Isolated data: `T=$(mktemp -d); cp ~/.ccmeter/ccmeter.db $T/ 2>/dev/null || CCMETER_HOME=$T node dist/cli/index.js record --all`.
   Start: `CCMETER_HOME=$T node dist/cli/index.js serve --ensure --port 7444 --url-only`.
3. Open the URL in the browser pane. Check, with screenshots: Sessions (cards, stacked chart full width, legend,
   table badges), a session page with switches/compactions (timeline markers, hatched subagent cost,
   reconciliation table), Rollups, Health. Then light theme, then the mobile preset (no horizontal page scroll:
   `document.documentElement.scrollWidth === clientWidth`). Read console errors.
4. Stop the server: `CCMETER_HOME=$T node dist/cli/index.js serve --stop`. Reset the viewport to desktop.
5. Report what you saw, including anything off. Fix, then repeat the affected checks.
6. For a route sweep, the React pitfall scan, crash debugging or a code review, continue with skill `react-check`
   (it reuses steps 1–2 above for serving).
