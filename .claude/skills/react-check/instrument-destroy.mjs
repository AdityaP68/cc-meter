#!/usr/bin/env node
// Patch an UNMINIFIED production bundle (vite build --minify false) so React logs any effect cleanup that is not a
// function, with the component that owns it, before calling it. Debugging only; never ship the patched file.
// Usage: node instrument-destroy.mjs <outDir>/assets/*.js   Verified against react-dom 19.3 (production build).
import { readFileSync, writeFileSync } from 'node:fs';

let patched = 0;
for (const f of process.argv.slice(2)) {
  let s = readFileSync(f, 'utf8');
  const head = /function commitHookEffectListUnmount\s*\(\s*[\w$]+\s*,\s*([\w$]+)/.exec(s);
  if (!head) continue;
  const fiber = head[1];
  const call = /([\w$]*destroy[\w$]*)\(\);/.exec(s.slice(head.index));
  if (!call) { console.error(`${f}: found commitHookEffectListUnmount but no destroy call; inspect it by hand`); continue; }
  const v = call[1], at = head.index + call.index;
  const guard = `if (typeof ${v} !== "function") console.error("[react-check] effect cleanup is not a function:", ` +
    `Object.prototype.toString.call(${v}), "in component", ${fiber}.type && (${fiber}.type.displayName || ${fiber}.type.name) || ${fiber}.type, ${fiber});\n`;
  s = s.slice(0, at) + guard + s.slice(at);
  writeFileSync(f, s);
  patched++;
  console.log(`${f}: patched (cleanup variable ${v}, fiber ${fiber})`);
}
if (!patched) { console.error('no bundle contained commitHookEffectListUnmount: is it unminified and does it include react-dom?'); process.exit(1); }
