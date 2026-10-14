import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './helpers/util.js';

// The SPA has no DOM test environment, so this guards the one failure mode that blanked the app: an effect with an
// expression body returns that expression as its cleanup. `useEffect(() => window.scrollTo(0, 0))` returned a Promise
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
