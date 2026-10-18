import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { openDb } from '../../core/db.js';
import { sessionscopeHome, ensureHome } from '../../core/paths.js';
import { loadPricing } from '../../core/pricing.js';
import { APP_ID, HOST, startServer } from '../../server/index.js';
import { flagNum, type Parsed } from '../args.js';

interface ServerInfo {
  pid: number;
  port: number;
  url: string;
  startedAt: string;
}
const infoFile = () => path.join(sessionscopeHome(), 'server.json');

/** The background server stops after this long without a request (an open dashboard tab does not poll). */
export const DEFAULT_IDLE_MINUTES = 30;

export function readConfig(): { port: number; openBrowser: boolean; idleMinutes: number } {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(sessionscopeHome(), 'config.json'), 'utf8'));
    const idle = Number(c.idleMinutes);
    return {
      port: Number(c.port) || 7337,
      openBrowser: !!c.openBrowser,
      // 0 disables the stop; a missing, negative or non-numeric value gets the default.
      idleMinutes: c.idleMinutes !== undefined && Number.isFinite(idle) && idle >= 0 ? idle : DEFAULT_IDLE_MINUTES,
    };
  } catch {
    return { port: 7337, openBrowser: false, idleMinutes: DEFAULT_IDLE_MINUTES };
  }
}

function readInfo(): ServerInfo | null {
  try {
    return JSON.parse(fs.readFileSync(infoFile(), 'utf8'));
  } catch {
    return null;
  }
}

/** True only for a live sessionscope server on loopback. */
function health(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port, path: '/api/health', timeout: 800 }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body).app === APP_ID);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => (req.destroy(), resolve(false)));
  });
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(cmd, args, () => undefined);
}

async function runningServer(): Promise<ServerInfo | null> {
  const info = readInfo();
  if (info && (await health(info.port))) return info;
  return null;
}

export async function cmdServe(args: Parsed): Promise<number> {
  const cfg = readConfig();

  if (args.flags.stop) {
    const info = readInfo();
    if (!info) return (console.log('sessionscope server is not running'), 0);
    try {
      process.kill(info.pid, 'SIGTERM');
      console.log(`stopped sessionscope server (pid ${info.pid})`);
    } catch {
      console.log('sessionscope server was not running');
    }
    fs.rmSync(infoFile(), { force: true });
    return 0;
  }

  const urlOnly = !!args.flags['url-only'];

  if (args.flags.ensure) {
    // Lazy start: reuse a running server, otherwise start a detached one and wait for it.
    let info = await runningServer();
    if (!info) {
      ensureHome();
      fs.rmSync(infoFile(), { force: true });
      const child = spawn(process.execPath, [process.argv[1]!, 'serve', '--child', '--port', String(flagNum(args, 'port') ?? cfg.port)], {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      });
      child.unref();
      for (let i = 0; i < 50 && !info; i++) {
        await new Promise((r) => setTimeout(r, 100));
        info = await runningServer();
      }
    }
    if (!info) {
      console.error('sessionscope: could not start the dashboard server (run `sessionscope serve` to see the error)');
      return 1;
    }
    if (args.flags.open || cfg.openBrowser) openBrowser(info.url);
    console.log(info.url);
    return 0;
  }

  // Foreground / child mode.
  ensureHome();
  const existing = await runningServer();
  if (existing && !args.flags.child) {
    console.log(urlOnly ? existing.url : `sessionscope dashboard already running at ${existing.url}`);
    if (args.flags.open) openBrowser(existing.url);
    return 0;
  }
  const db = openDb();
  const table = loadPricing();
  const idleMs = args.flags.child ? cfg.idleMinutes * 60_000 : 0;
  let stopping = false;
  const running = await startServer({
    port: flagNum(args, 'port') ?? cfg.port,
    db,
    table,
    refreshMs: 30_000,
    idleMs,
    onIdle: () => shutdown(),
  });
  const info: ServerInfo = { pid: process.pid, port: running.port, url: running.url, startedAt: new Date().toISOString() };
  fs.writeFileSync(infoFile(), JSON.stringify(info));
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    fs.rmSync(infoFile(), { force: true });
    running.close().finally(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  if (!args.flags.child) console.log(`sessionscope dashboard: ${running.url}  (127.0.0.1 only; Ctrl-C to stop)`);
  if (args.flags.open) openBrowser(running.url);
  // pick up anything the hooks missed (crashes, sessions from before install) without delaying startup
  setImmediate(() => {
    try {
      running.refresh();
    } catch {
      /* ignore */
    }
  });
  await new Promise(() => undefined); // run until signalled
  return 0;
}
