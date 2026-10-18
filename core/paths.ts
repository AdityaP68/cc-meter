import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DB_NAME = 'sessionscope.db';
const LEGACY_DB_NAME = 'ccmeter.db';

/** The folder this tool was called before the rename to sessionscope (2026-10-19). Read as a fallback, never deleted. */
export function legacyHome(): string {
  return path.join(os.homedir(), '.ccmeter');
}

/**
 * Where sessionscope keeps its DB and config. Override with SESSIONSCOPE_HOME (used by tests); the old CCMETER_HOME is
 * still honoured. Without either: ~/.sessionscope, or ~/.ccmeter while only that one exists (before `setup` copies it).
 */
export function sessionscopeHome(): string {
  const env = process.env.SESSIONSCOPE_HOME || process.env.CCMETER_HOME;
  if (env) return env;
  const fresh = path.join(os.homedir(), '.sessionscope');
  if (!fs.existsSync(fresh) && fs.existsSync(legacyHome())) return legacyHome();
  return fresh;
}

/** Claude Code's config dir. Claude Code honours CLAUDE_CONFIG_DIR, so do we. */
export function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

export function dbPath(): string {
  const home = sessionscopeHome();
  const fresh = path.join(home, DB_NAME);
  const legacy = path.join(home, LEGACY_DB_NAME);
  return !fs.existsSync(fresh) && fs.existsSync(legacy) ? legacy : fresh;
}

export interface LegacyCopy {
  status: 'copied' | 'none' | 'exists' | 'skipped';
  from?: string;
  to?: string;
}

/**
 * One-time, non-destructive copy of ~/.ccmeter to ~/.sessionscope (database renamed to sessionscope.db). Leaves out what
 * is only valid for a running process (server.json, cache/). Never deletes or edits the old folder, never overwrites.
 * Does nothing when a home is chosen by environment variable.
 */
export function migrateLegacyHome(): LegacyCopy {
  if (process.env.SESSIONSCOPE_HOME || process.env.CCMETER_HOME) return { status: 'skipped' };
  const from = legacyHome();
  const to = path.join(os.homedir(), '.sessionscope');
  if (fs.existsSync(to)) return { status: 'exists' };
  if (!fs.existsSync(from)) return { status: 'none' };
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (!e.isFile() || e.name === 'server.json') continue;
    const name = e.name.startsWith(LEGACY_DB_NAME) ? DB_NAME + e.name.slice(LEGACY_DB_NAME.length) : e.name;
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
        if (JSON.parse(fs.readFileSync(pj, 'utf8')).name === 'sessionscope') return dir;
      } catch {
        /* keep walking */
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error('sessionscope package root not found');
}

export function ensureHome(): string {
  const home = sessionscopeHome();
  fs.mkdirSync(home, { recursive: true });
  return home;
}
