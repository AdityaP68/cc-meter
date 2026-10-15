import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { facets, getSession, listSessions, overview, rollup, rollupDayModel, type Filters, type SessionSort } from '../core/aggregate.js';
import { openDb, type Db } from '../core/db.js';
import { runDoctor, verifyPricing, type Check } from '../core/doctor.js';
import { packageRoot } from '../core/paths.js';
import { loadPricing, type PriceTable } from '../core/pricing.js';
import { recordAll } from '../core/record.js';
import { reconcile } from '../core/reconcile.js';

export const APP_ID = 'ccmeter';
export const HOST = '127.0.0.1';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface ServerOptions {
  port: number;
  db?: Db;
  table?: PriceTable;
  /** Directory with the built dashboard. Defaults to <package>/dashboard/dist. */
  staticDir?: string;
  /** Re-scan ~/.claude/projects this often (ms). 0 disables. Cheap: unchanged transcripts are skipped by signature. */
  refreshMs?: number;
  /** Exit after this long without a request (ms). 0 disables. */
  idleMs?: number;
  skipExternalChecks?: boolean;
  onIdle?: () => void;
}

export interface RunningServer {
  server: http.Server;
  port: number;
  url: string;
  close(): Promise<void>;
  refresh(): { recorded: number; unchanged: number; errors: number };
}

function send(res: http.ServerResponse, status: number, body: unknown, type = 'application/json; charset=utf-8'): void {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    // The dashboard is self-contained: no third-party scripts, fonts, images or network calls.
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  });
  res.end(data);
}

/** Whole numbers only: SQLite reads a negative LIMIT as "no limit", and a huge OFFSET is just wasted work. */
export function pageParams(q: URLSearchParams): { limit: number; offset: number } {
  const whole = (name: string, fallback: number, min: number, max: number): number => {
    const n = Math.trunc(Number(q.get(name)));
    return Number.isFinite(n) && q.get(name) !== null && q.get(name) !== '' ? Math.min(Math.max(n, min), max) : fallback;
  };
  return { limit: whole('limit', 100, 1, 1000), offset: whole('offset', 0, 0, 1_000_000_000) };
}

function filtersFrom(q: URLSearchParams): Filters {
  const f: Filters = {};
  const since = q.get('since');
  if (since) f.since = /^\d+d$/.test(since) ? new Date(Date.now() - Number(since.slice(0, -1)) * 86400000).toISOString() : since;
  for (const k of ['until', 'project', 'model', 'source'] as const) {
    const v = q.get(k);
    if (v) f[k] = v;
  }
  return f;
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const db = opts.db ?? openDb();
  const table = opts.table ?? loadPricing();
  const staticDir = opts.staticDir ?? path.join(packageRoot(), 'dashboard', 'dist');
  let lastRequest = Date.now();
  let doctorCache: { at: number; checks: Check[] } | null = null;
  let port = opts.port;

  const doctor = (): Check[] => {
    if (!doctorCache || Date.now() - doctorCache.at > 5 * 60_000) {
      doctorCache = { at: Date.now(), checks: runDoctor(db, table, { skipExternal: opts.skipExternalChecks }) };
    }
    return doctorCache.checks;
  };
  const refresh = () => {
    const r = recordAll(db, table);
    doctorCache = null;
    return { recorded: r.recorded, unchanged: r.unchanged, errors: r.errors.length };
  };

  const hostOk = (h: string | undefined) => {
    // DNS-rebinding guard: only answer to the literal loopback names on our own port.
    if (!h) return false;
    return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(h.toLowerCase());
  };

  const server = http.createServer((req, res) => {
    lastRequest = Date.now();
    try {
      if (!hostOk(req.headers.host)) return send(res, 403, { error: 'forbidden host' });
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      const q = url.searchParams;

      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'POST') {
          // custom header forces a CORS preflight, which we never grant: blocks cross-site POSTs to localhost
          if (req.headers['x-ccmeter'] !== '1') return send(res, 403, { error: 'missing x-ccmeter header' });
          if (url.pathname === '/api/refresh') return send(res, 200, refresh());
          return send(res, 404, { error: 'not found' });
        }
        if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
        switch (url.pathname) {
          case '/api/health':
            return send(res, 200, { app: APP_ID, ok: true, pid: process.pid, port });
          case '/api/overview':
            return send(res, 200, overview(db, filtersFrom(q)));
          case '/api/facets':
            return send(res, 200, facets(db));
          case '/api/sessions': {
            const r = listSessions(db, {
              ...filtersFrom(q),
              ...pageParams(q),
              sort: (q.get('sort') as SessionSort) || 'recent',
            });
            return send(res, 200, r);
          }
          case '/api/rollups': {
            const by = q.get('by');
            if (by === 'daymodel') return send(res, 200, rollupDayModel(db, filtersFrom(q)));
            if (by !== 'day' && by !== 'project' && by !== 'model') return send(res, 400, { error: 'by must be day|project|model' });
            return send(res, 200, rollup(db, by, filtersFrom(q)));
          }
          case '/api/doctor':
            return send(res, 200, { checks: doctor(), pricing: verifyPricing(db, table) });
          default: {
            const m = /^\/api\/sessions\/([\w.-]+)$/.exec(url.pathname);
            if (m) {
              const d = getSession(db, m[1]!);
              if (!d) return send(res, 404, { error: 'unknown session' });
              return send(res, 200, { ...d, reconciliation: reconcile(d.session, table) });
            }
            return send(res, 404, { error: 'not found' });
          }
        }
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', 'text/plain');
      // static files with SPA fallback; path traversal guarded by resolving inside staticDir
      let rel = decodeURIComponent(url.pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      let file = path.resolve(staticDir, '.' + rel);
      if (!file.startsWith(path.resolve(staticDir) + path.sep) && file !== path.resolve(staticDir)) return send(res, 403, 'forbidden', 'text/plain');
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(staticDir, 'index.html');
      if (!fs.existsSync(file)) return send(res, 503, 'Dashboard not built. Run `npm run build`.', 'text/plain');
      send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] ?? 'application/octet-stream');
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : 'internal error' });
    }
  });

  const timers: NodeJS.Timeout[] = [];
  return new Promise((resolve, reject) => {
    const tryListen = (p: number, attempts: number) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempts > 0) tryListen(p + 1, attempts - 1);
        else reject(err);
      });
      port = p;
      // Bound to loopback only. Never 0.0.0.0, never ::.
      server.listen(p, HOST, () => {
        server.removeAllListeners('error');
        port = (server.address() as import('node:net').AddressInfo).port; // resolves port 0 (tests)
        if (opts.refreshMs) timers.push(setInterval(() => { try { refresh(); } catch { /* keep serving */ } }, opts.refreshMs).unref());
        if (opts.idleMs)
          timers.push(
            setInterval(() => {
              if (Date.now() - lastRequest > opts.idleMs!) opts.onIdle?.();
            }, Math.min(60_000, opts.idleMs)).unref(),
          );
        resolve({
          server,
          port,
          url: `http://127.0.0.1:${port}/`,
          refresh,
          close: () =>
            new Promise((r) => {
              timers.forEach(clearInterval);
              server.close(() => r());
              server.closeAllConnections?.();
            }),
        });
      });
    };
    tryListen(opts.port, 20);
  });
}
