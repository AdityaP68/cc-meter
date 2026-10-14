# 0002 — `node:sqlite` and zero runtime dependencies

**Status:** accepted 2026-10-14 (user asked to confirm; see docs/handoff.md)

**Context.** The v1 acceptance asks for clone-to-dashboard in under 5 minutes; native modules need prebuilt
binaries or a toolchain. Node 24's `node:sqlite` is available without flags from 22.13.

**Decision.** Use `node:sqlite`; `engines.node >= 22.13`; no runtime dependencies (HTTP via `node:http`, arg
parsing by hand, charts as hand-written SVG). Build/test tools (TypeScript, Vite, React, vitest) are dev-only,
exact-pinned, installed with `ignore-scripts=true`.

**Consequences.** Measured install: 5 s on a warm npm cache. Switching to `better-sqlite3` touches only `core/db.ts`.
