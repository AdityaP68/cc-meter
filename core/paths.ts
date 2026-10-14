import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where ccmeter keeps its DB and config. Override with CCMETER_HOME (used by tests). */
export function ccmeterHome(): string {
  return process.env.CCMETER_HOME || path.join(os.homedir(), '.ccmeter');
}

/** Claude Code's config dir. Claude Code honours CLAUDE_CONFIG_DIR, so do we. */
export function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

export function dbPath(): string {
  return path.join(ccmeterHome(), 'ccmeter.db');
}

/** Nearest ancestor directory holding ccmeter's package.json (works from src and from dist). */
export function packageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const pj = path.join(dir, 'package.json');
    if (fs.existsSync(pj)) {
      try {
        if (JSON.parse(fs.readFileSync(pj, 'utf8')).name === 'ccmeter') return dir;
      } catch {
        /* keep walking */
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error('ccmeter package root not found');
}

export function ensureHome(): string {
  const home = ccmeterHome();
  fs.mkdirSync(home, { recursive: true });
  return home;
}
