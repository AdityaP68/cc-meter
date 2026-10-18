import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DB_NAME = 'agent-lens.db';
/** Earlier names of this tool (ccmeter, then sessionscope): newest first. Read as fallbacks, never deleted. */
const LEGACY = [
  { dir: '.sessionscope', db: 'sessionscope.db' },
  { dir: '.ccmeter', db: 'ccmeter.db' },
];
const ENV_HOMES = ['AGENT_LENS_HOME', 'SESSIONSCOPE_HOME', 'CCMETER_HOME'];

const envHome = (): string | undefined => ENV_HOMES.map((k) => process.env[k]).find(Boolean);

/** The newest earlier folder that exists (~/.sessionscope, then ~/.ccmeter), if any. */
export function legacyHome(): string | undefined {
  return LEGACY.map((l) => path.join(os.homedir(), l.dir)).find((d) => fs.existsSync(d));
}

/**
 * Where agent-lens keeps its DB and config. Override with AGENT_LENS_HOME (used by tests); SESSIONSCOPE_HOME and CCMETER_HOME
 * are still honoured. Without any: ~/.agent-lens, or the newest earlier folder while only that exists (before `setup` copies it).
 */
export function agentLensHome(): string {
  const env = envHome();
  if (env) return env;
  const fresh = path.join(os.homedir(), '.agent-lens');
  return !fs.existsSync(fresh) && legacyHome() ? legacyHome()! : fresh;
}

/** Claude Code's config dir. Claude Code honours CLAUDE_CONFIG_DIR, so do we. */
export function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

export function dbPath(): string {
  const home = agentLensHome();
  const names = [DB_NAME, ...LEGACY.map((l) => l.db)].map((n) => path.join(home, n));
  return names.find((f) => fs.existsSync(f)) ?? path.join(home, DB_NAME);
}

export interface LegacyCopy {
  status: 'copied' | 'none' | 'exists' | 'skipped';
  from?: string;
  to?: string;
}

/**
 * One-time, non-destructive copy of the newest earlier folder to ~/.agent-lens (database renamed to agent-lens.db). Leaves
 * out what is only valid for a running process (server.json, cache/). Never deletes or edits the old folder, never
 * overwrites. Does nothing when a home is chosen by environment variable.
 */
export function migrateLegacyHome(): LegacyCopy {
  if (envHome()) return { status: 'skipped' };
  const to = path.join(os.homedir(), '.agent-lens');
  if (fs.existsSync(to)) return { status: 'exists' };
  const from = legacyHome();
  if (!from) return { status: 'none' };
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (!e.isFile() || e.name === 'server.json') continue;
    const old = LEGACY.find((l) => e.name.startsWith(l.db));
    const name = old ? DB_NAME + e.name.slice(old.db.length) : e.name;
    fs.copyFileSync(path.join(from, e.name), path.join(to, name));
  }
  return { status: 'copied', from, to };
}

/** Nearest ancestor directory holding this package's package.json (works from src and from dist). */
export function packageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const pj = path.join(dir, 'package.json');
    if (fs.existsSync(pj)) {
      try {
        if (JSON.parse(fs.readFileSync(pj, 'utf8')).name === 'agent-lens') return dir;
      } catch {
        /* keep walking */
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error('agent-lens package root not found');
}

export function ensureHome(): string {
  const home = agentLensHome();
  fs.mkdirSync(home, { recursive: true });
  return home;
}
