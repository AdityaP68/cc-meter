import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb } from '../core/db.js';
import { loadPricing } from '../core/pricing.js';
import { recordTranscript } from '../core/record.js';
import { pageParams, startServer, type RunningServer } from '../server/index.js';
import { installFixture, tmpDir } from './helpers/util.js';

let srv: RunningServer;
let staticDir: string;

function req(method: string, p: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: srv.port, path: p, method, headers: { Host: `127.0.0.1:${srv.port}`, ...headers } }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode!, body, headers: res.headers }));
    });
    r.on('error', reject);
    r.end();
  });
}
const json = async (p: string) => JSON.parse((await req('GET', p)).body);

beforeAll(async () => {
  const claude = tmpDir('claude-');
  process.env.CLAUDE_CONFIG_DIR = claude;
  process.env.AGENT_LENS_HOME = tmpDir();
  const db = openDb(':memory:');
  const table = loadPricing({ overridePath: null });
  recordTranscript(db, table, installFixture('cc-2.1.28x/multi-model-compaction.jsonl', claude, '-proj-a'));
  recordTranscript(db, table, installFixture('cc-2.1.287/sdk-complete.jsonl', claude, '-proj-b'));
  staticDir = tmpDir('static-');
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>t</title>');
  fs.writeFileSync(path.join(tmpDir('secret-'), 'x'), 'secret');
  srv = await startServer({ port: 0, db, table, staticDir, skipExternalChecks: true });
});
afterAll(async () => {
  await srv.close();
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.AGENT_LENS_HOME;
});

describe('dashboard server', () => {
  it('binds to loopback only', () => {
    const addr = srv.server.address() as import('node:net').AddressInfo;
    expect(addr.address).toBe('127.0.0.1');
    expect(srv.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it('answers health with the app id', async () => {
    expect(await json('/api/health')).toMatchObject({ app: 'agent-lens', ok: true });
  });

  it('rejects foreign Host headers (DNS rebinding) and cross-site POSTs', async () => {
    expect((await req('GET', '/api/health', { Host: 'evil.example' })).status).toBe(403);
    expect((await req('GET', '/api/health', { Host: `evil.example:${srv.port}` })).status).toBe(403);
    expect((await req('POST', '/api/refresh')).status).toBe(403);
    expect((await req('POST', '/api/refresh', { 'x-agent-lens': '1' })).status).toBe(200);
    expect((await req('DELETE', '/api/sessions/x')).status).toBe(405);
  });

  it('clamps limit and offset from the query string', async () => {
    expect((await json('/api/sessions?limit=-1')).rows).toHaveLength(1); // SQLite reads a negative LIMIT as "no limit"
    expect((await json('/api/sessions?limit=1.9')).rows).toHaveLength(1);
    expect((await json('/api/sessions?limit=abc')).rows).toHaveLength(2);
    expect((await json('/api/sessions?limit=1&offset=-4')).rows).toHaveLength(1);
    expect((await json('/api/sessions?limit=5&offset=1')).rows).toHaveLength(1);
    expect(pageParams(new URLSearchParams('limit=99999999&offset=9e99'))).toEqual({ limit: 1000, offset: 1_000_000_000 });
    expect(pageParams(new URLSearchParams(''))).toEqual({ limit: 100, offset: 0 });
  });

  it('sends no CORS headers and a restrictive CSP', async () => {
    const r = await req('GET', '/api/overview');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('serves overview, sessions, rollups, facets and session detail consistently', async () => {
    const ov = await json('/api/overview');
    const list = await json('/api/sessions?limit=10');
    expect(ov.sessions).toBe(2);
    expect(list.total).toBe(2);
    expect(list.rows.reduce((n: number, s: any) => n + s.costUsd, 0)).toBeCloseTo(ov.costUsd, 9);
    for (const by of ['day', 'project', 'model']) {
      const rows = await json(`/api/rollups?by=${by}`);
      expect(rows.reduce((n: number, r: any) => n + r.costUsd, 0)).toBeCloseTo(ov.costUsd, 6);
    }
    const dm = await json('/api/rollups?by=daymodel');
    expect(dm.reduce((n: number, r: any) => n + r.costUsd, 0)).toBeCloseTo(ov.costUsd, 6);
    const f = await json('/api/facets');
    expect(f.projects.length).toBeGreaterThan(0);
    const id = list.rows.find((s: any) => s.switches > 0).sessionId;
    const d = await json(`/api/sessions/${id}`);
    expect(d.events.some((e: any) => e.kind === 'model_switch')).toBe(true);
    expect(d.events.some((e: any) => e.kind === 'compaction')).toBe(true);
    expect(d.reconciliation.length).toBeGreaterThan(0);
    expect(d.turns.reduce((n: number, t: any) => n + t.costUsd, 0)).toBeCloseTo(d.session.costUsd, 6);
  });

  it('filters by model, project and source', async () => {
    expect((await json('/api/sessions?project=-nope')).total).toBe(0);
    expect((await json('/api/sessions?source=agent-lens-judge')).total).toBe(0);
    expect((await json('/api/sessions?model=claude-opus-5-5')).total).toBe(1);
    expect((await req('GET', '/api/rollups?by=bogus')).status).toBe(400);
    expect((await req('GET', '/api/sessions/unknown-id')).status).toBe(404);
  });

  it('exposes doctor checks and the pricing verification', async () => {
    const d = await json('/api/doctor');
    expect(Array.isArray(d.checks)).toBe(true);
    expect(d.checks.find((c: any) => c.id === 'db').level).toBe('ok');
  });

  it('serves the SPA with fallback, and cannot be walked out of its directory', async () => {
    expect((await req('GET', '/')).body).toContain('<title>t</title>');
    expect((await req('GET', '/some/client/route')).body).toContain('<title>t</title>');
    const trav = await req('GET', '/..%2f..%2f..%2fetc%2fpasswd');
    expect(trav.body).not.toContain('root:');
    expect([200, 403]).toContain(trav.status);
  });
});
