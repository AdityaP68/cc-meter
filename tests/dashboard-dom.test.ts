// @vitest-environment happy-dom
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb } from '../core/db.js';
import { loadPricing } from '../core/pricing.js';
import { recordTranscript } from '../core/record.js';
import { startServer, type RunningServer } from '../server/index.js';
import { DOC_PAGES, DOC_SLUGS } from '../dashboard/src/docs-content.ts';
import { renderMarkdown, resolveHref } from '../dashboard/src/docs-markdown.tsx';
import { asst, costStateLine, installFixture, tmpDir } from './helpers/util.js';

// DOM smoke test for the SPA: the real server on fixture data, the real App, navigation through its own links.
// It guards the class of failure behind the blank-page bug (82bf4ae): an error in the commit phase unmounts the
// whole app on a route change. window.scrollTo returns a Promise as in current Chromium, so an expression-bodied
// `useEffect(() => window.scrollTo(0, 0))` fails here too.

let srv: RunningServer;
const errors: string[] = [];
const root = () => document.getElementById('root')!;

// The SPA calls relative /api paths; send them to the test server over loopback.
function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const p = new URL(String(input), 'http://127.0.0.1/');
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { Host: `127.0.0.1:${srv.port}`, ...(init?.headers as Record<string, string> | undefined) };
    const r = http.request({ host: '127.0.0.1', port: srv.port, path: p.pathname + p.search, method: init?.method ?? 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve(new Response(body, { status: res.statusCode, headers: { 'content-type': String(res.headers['content-type'] ?? '') } })));
    });
    r.on('error', reject);
    r.end();
  });
}

// Let fetches resolve and React commit, until `done` holds or the time runs out.
async function settle(done: () => boolean = () => false, ms = 3000): Promise<void> {
  const until = Date.now() + ms;
  do await act(() => new Promise<void>((r) => setTimeout(r, 25)));
  while (!done() && Date.now() < until);
}

async function go(hash: string, expectText: string): Promise<void> {
  const link = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].find((a) => a.getAttribute('href') === hash);
  // Prefer the app's own link; a session-to-session change has none, so set the hash as the browser would.
  if (link) await act(() => { link.click(); });
  if (location.hash !== hash) await act(() => { location.hash = hash; });
  await settle(() => root().textContent!.includes(expectText));
  expect(errors, `console errors after ${hash}`).toEqual([]);
  expect(root().textContent, `content of ${hash}`).toContain(expectText);
}

beforeAll(async () => {
  const claude = tmpDir('claude-');
  process.env.CLAUDE_CONFIG_DIR = claude;
  process.env.AGENT_LENS_HOME = tmpDir();
  const db = openDb(':memory:');
  const table = loadPricing({ overridePath: null });
  recordTranscript(db, table, installFixture('cc-2.1.28x/multi-model-compaction.jsonl', claude, '-proj-a'));
  recordTranscript(db, table, installFixture('cc-2.1.287/sdk-complete.jsonl', claude, '-proj-b'));
  // Claude Code counted more than the transcript in every class: an estimate of calls not in the transcript.
  const dir = path.join(claude, 'projects', '-proj-h');
  fs.mkdirSync(dir, { recursive: true });
  const t = { input: 50_000, output: 2000, cacheWrite: 1000, cacheRead: 9_000_000, costUSD: 3.5 };
  fs.writeFileSync(path.join(dir, 'hidden-calls.jsonl'), [asst({ id: 'h1', input: 100, output: 50, cw: 1000, cw1h: 1000, cr: 5000 }), costStateLine({ 'claude-sonnet-5-5': t })].join('\n'));
  recordTranscript(db, table, path.join(dir, 'hidden-calls.jsonl'));
  // Claude Code's record covers only part of the session (2026-10-15 case): no entry for the first model, about half
  // of the second's output and cache. Its total is far below agent-lens's and must not read as the session's cost.
  const opus = { id: 'p2', model: 'claude-opus-5-5', input: 400, output: 20_000, cw: 50_000, cw1h: 50_000, cr: 900_000 };
  fs.writeFileSync(path.join(dir, 'cc-partial.jsonl'), [
    asst({ id: 'p1', model: 'claude-sonnet-5-5', input: 300, output: 4000, cw: 20_000, cw1h: 20_000, cr: 100_000 }),
    asst(opus),
    costStateLine({ 'claude-opus-5-5': { input: 400, output: 10_000, cacheWrite: 25_000, cacheRead: 450_000, costUSD: 0.5 } }),
  ].join('\n'));
  recordTranscript(db, table, path.join(dir, 'cc-partial.jsonl'));
  srv = await startServer({ port: 0, db, table, staticDir: tmpDir('static-'), skipExternalChecks: true });

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = apiFetch as typeof fetch;
  window.scrollTo = (() => Promise.resolve()) as unknown as typeof window.scrollTo;
  const origError = console.error;
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ').slice(0, 300)); origError(...a); };
  window.addEventListener('error', (e) => errors.push(`uncaught: ${e.message}`));
  localStorage.setItem('agent-lens.filters', JSON.stringify({ range: 'all', project: '', model: '', source: '' }));
  document.body.innerHTML = '<div id="root"></div>';
  location.hash = '#/';
  await act(async () => { await import('../dashboard/src/main.tsx'); });
  await settle(() => root().querySelectorAll('a[href^="#/session/"]').length >= 3);
});
afterAll(async () => {
  await srv?.close();
});

describe('dashboard in a DOM', () => {
  it('renders the sessions page with fixture sessions', () => {
    expect(errors).toEqual([]);
    expect(root().textContent).toContain('Sessions');
    expect(root().querySelectorAll('a[href^="#/session/"]').length).toBeGreaterThanOrEqual(2);
  });

  it('explains every flag chip on hover, keyboard focus and tap', async () => {
    const chips = [...root().querySelectorAll<HTMLButtonElement>('.flags button.chip')];
    expect(chips.length, 'fixture sessions show flag chips').toBeGreaterThan(0);
    for (const c of chips) {
      const tip = document.getElementById(c.getAttribute('aria-describedby') ?? '');
      expect(tip, `tooltip for ${c.textContent}`).not.toBeNull();
      expect(tip!.getAttribute('role')).toBe('tooltip');
      expect(tip!.textContent!.length, `explanation for ${c.textContent}`).toBeGreaterThan(40);
      expect(tip!.hidden).toBe(true);
    }
    const c = chips[0]!;
    const tip = () => document.getElementById(c.getAttribute('aria-describedby')!)!;
    await act(() => { c.click(); }); // a tap pins it open
    expect(tip().hidden).toBe(false);
    expect(c.getAttribute('aria-expanded')).toBe('true');
    await act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(tip().hidden).toBe(true);
    await act(() => { c.click(); });
    await act(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }); // tap elsewhere
    expect(tip().hidden).toBe(true);
    await act(() => { c.focus(); });
    expect(tip().hidden, 'opens on keyboard focus').toBe(false);
    await act(() => { c.blur(); });
    expect(tip().hidden).toBe(true);
    expect(root().querySelector('.flag-legend')?.textContent).toContain('lower bound');
    expect(root().querySelector('.flag-legend')?.textContent, 'no unmeasured "slightly"').not.toContain('slightly');
    expect(errors).toEqual([]);
  });

  it('labels calls not in the transcript as an estimate, on the row and the session page', async () => {
    const chip = [...root().querySelectorAll<HTMLButtonElement>('.flags button.chip')].find((c) => c.textContent!.includes('not in transcript'));
    expect(chip, 'estimate chip on the hidden-calls row').toBeDefined();
    expect(chip!.textContent).toMatch(/^≈ \$\d/);
    const tip = document.getElementById(chip!.getAttribute('aria-describedby')!)!;
    expect(tip.textContent).toContain('Estimate');
    expect(tip.textContent).toContain('not added to');
    // Only one Claude Code chip per row: the estimate replaces the plain "CC $x" chip.
    expect(chip!.closest('.flags')!.textContent).not.toMatch(/CC \$/);
    await go('#/session/hidden-calls', 'hidden-calls');
    const banner = [...root().querySelectorAll('.banner')].find((b) => b.textContent!.includes('not in the transcript'));
    expect(banner?.textContent).toMatch(/≈ \$\d/);
    expect(banner?.textContent).toContain('estimate');
    await go('#/', 'Sessions');
    await settle(() => root().querySelectorAll('a[href^="#/session/"]').length >= 3);
  });

  it("shows no Claude Code total on a row whose record is partial, and says why on the session page", async () => {
    const row = root().querySelector('a[href="#/session/cc-partial"]')!.closest('tr')!;
    expect(row.querySelector('.flags')!.textContent).not.toMatch(/CC/);
    expect(root().querySelector('.flag-legend')?.textContent).toContain('whole session');
    expect(root().querySelector('.rows-note')?.textContent).toContain('Each row shows the whole session');
    await go('#/session/cc-partial', 'cc-partial');
    const banner = [...root().querySelectorAll('.banner')].find((b) => b.textContent!.includes('partial'));
    expect(banner?.textContent).toContain("Claude Code's record is partial");
    expect(banner?.textContent).toContain('no entry for');
    expect(banner?.textContent).toMatch(/agent-lens's total, \$[\d.,]+, is the complete one/);
    expect(root().textContent, 'per-model comparison kept').toContain("Check against Claude Code's own accounting");
    await go('#/', 'Sessions');
    await settle(() => root().querySelectorAll('a[href^="#/session/"]').length >= 4);
  });

  it("never shows one session's numbers under another session's address while the next one loads", async () => {
    await go('#/session/hidden-calls', 'hidden-calls');
    // Wait for the router to see the new address (hashchange is async), not for the new session's fetch.
    await act(() => new Promise<void>((r) => { addEventListener('hashchange', () => setTimeout(r, 0), { once: true }); location.hash = '#/session/cc-partial'; }));
    expect(root().querySelector('.mono'), 'session id line').toBeNull();
    expect(root().textContent, 'previous session still on screen').not.toContain('hidden-calls');
    await settle(() => root().textContent!.includes('cc-partial'));
    expect(root().textContent).toContain('cc-partial');
    await go('#/', 'Sessions');
    await settle(() => root().querySelectorAll('a[href^="#/session/"]').length >= 4);
  });

  it('survives navigating every route, session to session, and back', async () => {
    const sessions = [...new Set([...root().querySelectorAll<HTMLAnchorElement>('a[href^="#/session/"]')].map((a) => a.getAttribute('href')!))];
    await go('#/rollups', 'Rollups');
    await go('#/health', 'Health checks');
    await go('#/', 'Sessions');
    // Each session page must show its own id: session to session reuses the component (stale state would show here).
    await go(sessions[0]!, sessions[0]!.slice('#/session/'.length));
    await go(sessions[1]!, sessions[1]!.slice('#/session/'.length));
    await go('#/rollups', 'Rollups');
    await go('#/', 'Sessions');
    expect(root().childElementCount).toBeGreaterThan(0);
  });

  it('opens the docs index and every docs page without unmounting the app', async () => {
    await go('#/docs', 'Documentation');
    expect(root().querySelector('h1')?.textContent).toBe('Documentation');
    expect(root().querySelector('.filters'), 'no filter bar on docs pages').toBeNull();
    expect(root().querySelector('nav[aria-label="Pages"] a[href="#/docs"]')?.getAttribute('aria-current')).toBe('page');
    for (const p of DOC_PAGES) expect(root().querySelector(`.docs-cards a[href="#/docs/${p.slug}"]`), `index links ${p.slug}`).not.toBeNull();
    for (const p of DOC_PAGES) {
      await go(`#/docs/${p.slug}`, p.title);
      const h1s = root().querySelectorAll('h1');
      expect(h1s.length, `one h1 on ${p.slug}`).toBe(1);
      expect(h1s[0]!.textContent).toBe(p.title);
      expect(root().querySelector('.filters'), `no filter bar on ${p.slug}`).toBeNull();
      expect(root().querySelector('.md'), `body of ${p.slug}`).not.toBeNull();
      expect(root().querySelector(`.docs-nav a[href="#/docs/${p.slug}"]`)?.getAttribute('aria-current')).toBe('page');
    }
    // A heading in the address, an unknown page and an unknown heading must not crash.
    const first = DOC_PAGES[0]!;
    await go(`#/docs/${first.slug}/no-such-heading`, first.title);
    await go('#/docs/no-such-page', 'Page not found');
    expect(root().querySelector('h1')?.textContent).toBe('Page not found');
    expect(root().querySelector('a[href="#/docs"]'), 'link back to the index').not.toBeNull();
    await go('#/docs/%E0%A4%A', 'Page not found'); // a malformed escape
    await go('#/rollups', 'Rollups');
    await go('#/', 'Sessions');
    expect(errors).toEqual([]);
  });

  it('scrolls to a heading named in the address after the lazy docs chunk loads, and moves focus to the h1 on page change', async () => {
    const scrolled: string[] = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); };
    try {
      const page = DOC_PAGES.find((p) => p.slug === 'overview')!;
      await go('#/', 'Sessions');
      await go(`#/docs/${page.slug}`, page.title);
      const target = root().querySelector<HTMLAnchorElement>('.docs-toc nav a');
      expect(target, 'overview has a contents list').not.toBeNull();
      const anchor = target!.getAttribute('href')!.split('/').pop()!;
      await go(`#/docs/${page.slug}/${anchor}`, page.title);
      await settle(() => scrolled.length > 0);
      expect(scrolled).toContain(`d-${anchor}`);
      const next = root().querySelector<HTMLAnchorElement>('.docs-pn a.next')!;
      await act(() => { next.click(); });
      await settle(() => document.activeElement?.tagName === 'H1');
      expect(document.activeElement?.tagName, 'focus moves to the new page heading').toBe('H1');
      expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
    await go('#/', 'Sessions');
  });

  it('resolves only guide pages and dashboard routes as links', () => {
    const known = new Set(['costs']);
    expect(resolveHref('costs.md', known)).toBe('#/docs/costs');
    expect(resolveHref('./Costs.md#Unpriced', known)).toBe('#/docs/costs/unpriced');
    expect(resolveHref('nope.md', known)).toBeNull();
    expect(resolveHref('#/rollups')).toBe('#/rollups');
    for (const bad of ['javascript:alert(1)', 'https://example.com', '//evil.example', '#frag', '#/a b', '#/"x', 'data:text/html,x', '../x.md', 'a/b.md', '']) {
      expect(resolveHref(bad), bad).toBeNull();
    }
  });

  it('keeps every guide link live and the guide inside the supported subset', async () => {
    for (const p of DOC_PAGES) {
      const body = p.body.replace(/^(\s*)(```|~~~)[\s\S]*?^\s*\2.*$/gm, '').replace(/`[^`\n]*`/g, '');
      const written = (body.match(/\]\(/g) ?? []).length;
      const host = document.createElement('div');
      document.body.appendChild(host);
      const rr = createRoot(host);
      await act(() => { rr.render(createElement(Fragment, null, ...renderMarkdown(p.body, { knownSlugs: DOC_SLUGS }).nodes)); });
      expect(host.querySelectorAll('a').length, `${p.slug}: every [text](target) resolves to a guide page or dashboard route`).toBe(written);
      expect(body, `${p.slug}: no HTML tags`).not.toMatch(/<\/?(div|span|a|b|i|br|img|details|summary|table|p)[\s>/]/);
      expect(body, `${p.slug}: no images`).not.toMatch(/!\[/);
      expect(body, `${p.slug}: no indented list item (nested lists are flattened)`).not.toMatch(/^ {2,}([-*+]|\d+\.) /m);
      await act(() => { rr.unmount(); });
      host.remove();
    }
  });

  it('renders the docs markdown subset as safe React elements', async () => {
    const md = [
      '# Title', '', '## First *section*', 'Some `code` and **bold** text, [a page](costs.md), [a route](#/health), [unknown](nope.md),',
      '[web](https://example.com/x), [js](javascript:alert(1)), ![img](x.png) <script>window.__xss = 1</script> <b>x</b>.', '',
      '- one', '- two', 'continued', '', '1. a', '```bash', 'sessionscope doctor | grep warn', '```', '2. b', '',
      '> **Unverified:** a claim', '', '| a | b |', '| --- | ---: |', '| `x\\|y` | 2 |', '| only |', '', '### Sub', '#### Deeper', '---', '', '```json', '{ "unterminated": true',
    ].join('\n');
    const r = renderMarkdown(md, { knownSlugs: DOC_SLUGS });
    expect(r.outline.map((o) => o.text)).toEqual(['First section']);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const rr = createRoot(host);
    await act(() => { rr.render(createElement(Fragment, null, ...r.nodes)); });
    const hrefs = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#/docs/costs', '#/health']);
    expect(host.textContent).toContain('unknown');
    expect(host.textContent).toContain('web');
    expect(host.querySelector('script'), 'raw HTML is text, not markup').toBeNull();
    expect(host.querySelector('b'), 'raw HTML is text, not markup').toBeNull();
    expect(host.textContent).toContain('<script>');
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('h2#d-first-section em')?.textContent).toBe('section');
    expect(host.querySelector('ol[start="2"]'), 'numbering continues after a code block').not.toBeNull();
    expect(host.querySelectorAll('li').length).toBe(4);
    expect(host.querySelector('.md-code-h button')?.textContent).toBe('Copy');
    expect(host.querySelectorAll('.md-code-h button').length, 'copy button on bash blocks only').toBe(1);
    expect(host.querySelector('pre code')?.textContent).toBe('sessionscope doctor | grep warn');
    expect(host.querySelector('blockquote.unverified strong')?.textContent).toBe('Unverified:');
    const table = host.querySelector('.md-table')!;
    expect(table.getAttribute('role')).toBe('region');
    expect(table.getAttribute('tabindex')).toBe('0');
    expect(table.getAttribute('aria-label')).toContain('Table');
    expect(table.querySelectorAll('tbody tr').length).toBe(2);
    expect(table.querySelectorAll('tbody tr:last-child td').length, 'short rows are padded').toBe(2);
    expect(host.querySelector('h4')?.textContent).toBe('Deeper');
    expect(host.querySelectorAll('pre').length).toBe(2);
    expect(host.querySelectorAll('pre')[1]!.textContent, 'unterminated fence runs to the end').toContain('unterminated');
    // Hostile or malformed input degrades to text; it never throws.
    for (const bad of ['', '[', '[]()', '**', '*', '`', '```', '| a |\n| - |', '> > > > > x', '[[[[[[a]]]]]](x.md)', '#'.repeat(10), '\\', '- ', '1. ']) {
      expect(() => renderMarkdown(bad)).not.toThrow();
    }
    await act(() => { rr.unmount(); });
    host.remove();
    expect(errors).toEqual([]);
  });

  it('renders pathological input in bounded time (the inline scanners are quadratic, so long runs are plain text)', () => {
    const cases: Array<[string, string]> = [
      ['unmatched emphasis', '*a '.repeat(350_000)],
      ['unmatched brackets', '['.repeat(500_000)],
      ['unclosed links', '[a](b '.repeat(150_000)],
      ['one long list item', `- ${'*a '.repeat(200_000)}`],
      ['one long table cell', `| h |\n| - |\n| ${'[a](b '.repeat(100_000)} |`],
    ];
    for (const [name, md] of cases) {
      const t = performance.now();
      const r = renderMarkdown(md);
      expect(r.nodes.length, name).toBeGreaterThan(0);
      expect(performance.now() - t, `${name}: milliseconds`).toBeLessThan(3000);
    }
  });
});
