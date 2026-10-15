import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './helpers/util.js';

// Static guard for the failure mode that blanked the app (tests/dashboard-dom.test.ts covers it at runtime): an effect
// with an expression body returns that expression as its cleanup. `useEffect(() => window.scrollTo(0, 0))` returned a Promise
// in current Chromium; React called it on the next hash change, threw, and unmounted the page until a reload.
describe('dashboard effects', () => {
  it('every useEffect / useLayoutEffect callback has a block body', () => {
    const dir = path.join(ROOT, 'dashboard', 'src');
    const bad: string[] = [];
    for (const f of fs.readdirSync(dir).filter((n) => /\.tsx?$/.test(n))) {
      fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
        if (/use(Layout|Insertion)?Effect\(\s*(async\s*)?\([^)]*\)\s*=>\s*[^{\s]/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
});

// A table cell styled with display:flex leaves the table layout: it shrinks to its content, and its border no longer
// lines up with the rest of the row (the skewed Flags column). Put flex on an inner element instead.
describe('dashboard table cells', () => {
  it('no class used on a <td> or <th> sets display', () => {
    const src = fs.readdirSync(path.join(ROOT, 'dashboard', 'src')).filter((n) => n.endsWith('.tsx')).map((n) => fs.readFileSync(path.join(ROOT, 'dashboard', 'src', n), 'utf8')).join('\n');
    const css = fs.readFileSync(path.join(ROOT, 'dashboard', 'src', 'styles.css'), 'utf8');
    const classes = new Set([...src.matchAll(/<t[dh][^>]*className="([^"]+)"/g)].flatMap((m) => m[1]!.split(/\s+/)));
    const bad = [...classes].filter((c) => new RegExp(`(^|[\\s,}])(t[dh])?\\.${c}\\s*\\{[^}]*\\bdisplay\\s*:`, 'm').test(css));
    expect(bad).toEqual([]);
  });
});

