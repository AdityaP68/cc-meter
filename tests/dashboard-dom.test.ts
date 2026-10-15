// @vitest-environment happy-dom
import http from 'node:http';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb } from '../core/db.js';
import { loadPricing } from '../core/pricing.js';
import { recordTranscript } from '../core/record.js';
import { startServer, type RunningServer } from '../server/index.js';
import { installFixture, tmpDir } from './helpers/util.js';

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
  process.env.CCMETER_HOME = tmpDir();
  const db = openDb(':memory:');
  const table = loadPricing({ overridePath: null });
  recordTranscript(db, table, installFixture('cc-2.1.28x/multi-model-compaction.jsonl', claude, '-proj-a'));
  recordTranscript(db, table, installFixture('cc-2.1.287/sdk-complete.jsonl', claude, '-proj-b'));
  srv = await startServer({ port: 0, db, table, staticDir: tmpDir('static-'), skipExternalChecks: true });

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = apiFetch as typeof fetch;
  window.scrollTo = (() => Promise.resolve()) as unknown as typeof window.scrollTo;
  const origError = console.error;
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ').slice(0, 300)); origError(...a); };
  window.addEventListener('error', (e) => errors.push(`uncaught: ${e.message}`));
  localStorage.setItem('ccmeter.filters', JSON.stringify({ range: 'all', project: '', model: '', source: '' }));
  document.body.innerHTML = '<div id="root"></div>';
  location.hash = '#/';
  await act(async () => { await import('../dashboard/src/main.tsx'); });
  await settle(() => root().querySelectorAll('a[href^="#/session/"]').length >= 2);
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
    expect(errors).toEqual([]);
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
});
