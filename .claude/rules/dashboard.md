---
paths:
  - "dashboard/**"
  - "server/**"
---
# Dashboard and server

- Server binds `127.0.0.1` only, checks `Host`, requires `x-agent-lens: 1` on POST, sends no CORS headers; CSP
  `default-src 'self'`. No external fonts, scripts or images (no network).
- The SPA mirrors API types in `dashboard/src/api.ts` (no imports from `core/`, which is Node-only).
- Charts: palette tokens in `styles.css` (light + dark), fixed colour per known model (`charts.tsx`), a table view
  for every chart, a hover tooltip, a legend for ≥ 2 series. Unpriced and doctor warnings stay visible.
- Typecheck both projects (`npm run verify`; it includes the DOM smoke test `tests/dashboard-dom.test.ts`), then
  look at it: skill `dashboard-check` (dark, light, 375 px), then `react-check` (route sweep, React pitfalls, review).
- Never set `display` on a `<td>`/`<th>` class (it breaks row alignment); flex goes on an inner element.
- Never point a dev server at the user's real `~/.agent-lens`; copy the DB into a temporary `AGENT_LENS_HOME`.
