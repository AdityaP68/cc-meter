import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../../core/db.js';
import { claudeHome, ensureHome, migrateLegacyHome, packageRoot, sessionscopeHome } from '../../core/paths.js';
import { loadPricing } from '../../core/pricing.js';
import { recordAll } from '../../core/record.js';
import type { Parsed } from '../args.js';

const MARKETPLACE = 'sessionscope';
const PLUGIN = 'sessionscope@sessionscope';
/** Registered by versions before the rename; replaced by setup so the hooks do not run twice. */
const LEGACY_MARKETPLACE = 'ccmeter';
const LEGACY_PLUGIN = 'ccmeter@ccmeter';
const LEGACY_STATUSLINE = 'ccmeter statusline';

function claude(args: string[]): { ok: boolean; out: string } {
  try {
    const out = execFileSync('claude', args, { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (e: any) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || String(e.message ?? e) };
  }
}

/**
 * `sessionscope setup`: create ~/.sessionscope, remember where this CLI lives (for the hook launcher), register this package
 * as a local plugin marketplace, install the plugin, backfill history. Used by install.sh and by `npx sessionscope setup`.
 */
export async function cmdSetup(args: Parsed): Promise<number> {
  const root = packageRoot();
  const cli = fs.realpathSync(path.join(root, 'dist', 'cli', 'index.js'));

  if (args.flags.uninstall) {
    for (const [plugin, marketplace] of [
      [PLUGIN, MARKETPLACE],
      [LEGACY_PLUGIN, LEGACY_MARKETPLACE],
    ] as [string, string][]) {
      const gone = claude(['plugin', 'uninstall', plugin]);
      if (gone.ok || plugin === PLUGIN) console.log(gone.out);
      const mp = claude(['plugin', 'marketplace', 'remove', marketplace]);
      if (mp.ok || marketplace === MARKETPLACE) console.log(mp.out);
    }
    console.log(`Plugin removed. Your data in ${sessionscopeHome()} was left in place; delete it yourself if you want it gone.`);
    return 0;
  }

  const copy = migrateLegacyHome();
  if (copy.status === 'copied') console.log(`✔ copied ${copy.from} to ${copy.to} (the old folder was left in place; delete it yourself when you are satisfied)`);
  const home = ensureHome();
  fs.writeFileSync(path.join(home, 'cli-path'), cli + '\n');
  const cfg = path.join(home, 'config.json');
  if (!fs.existsSync(cfg)) fs.writeFileSync(cfg, JSON.stringify({ port: 7337, openBrowser: false }, null, 2) + '\n');
  console.log(`✔ ${home} ready (hook launcher -> ${cli})`);

  if (!claude(['--version']).ok) {
    console.log('⚠ `claude` is not on PATH: skipped plugin install. Install Claude Code, then re-run `sessionscope setup`.');
  } else {
    if (/ccmeter@ccmeter/.test(claude(['plugin', 'list']).out)) {
      claude(['plugin', 'uninstall', LEGACY_PLUGIN]);
      claude(['plugin', 'marketplace', 'remove', LEGACY_MARKETPLACE]);
      console.log(`✔ replaced the plugin ${LEGACY_PLUGIN} (its name before the rename)`);
    }
    const add = claude(['plugin', 'marketplace', 'add', root]);
    if (add.ok || /already/i.test(add.out)) console.log(`✔ marketplace "${MARKETPLACE}" registered (${root})`);
    else console.log(`⚠ could not register marketplace: ${add.out}`);
    const inst = claude(['plugin', 'install', PLUGIN]);
    if (inst.ok || /already/i.test(inst.out)) console.log(`✔ plugin ${PLUGIN} installed (hooks: Stop, SessionEnd, UserPromptSubmit for /sessionscope)`);
    else console.log(`⚠ could not install plugin: ${inst.out}`);
  }

  if (!args.flags['no-backfill']) {
    const db = openDb();
    const r = recordAll(db, loadPricing());
    db.close();
    console.log(`✔ backfilled ${r.recorded} sessions from ${path.join(claudeHome(), 'projects')} (${r.empty} had no assistant messages)`);
  }

  console.log(`
Optional: show live cost in Claude Code's status line by adding this to ~/.claude/settings.json
  "statusLine": { "type": "command", "command": "sessionscope statusline" }
(or run \`sessionscope setup --statusline\` and I'll add it if you have none).`);
  const statuslineOk = args.flags.statusline || hasLegacyStatusline() ? installStatusline() : true;
  console.log(`\n${statuslineOk ? 'Done.' : 'Done, except the status line (see above).'} Run \`sessionscope doctor\` to verify, and \`/sessionscope\` in Claude Code (or \`sessionscope serve --open\`) for the dashboard.`);
  return statuslineOk ? 0 : 1;
}

/** True when settings.json still runs the status line under its pre-rename command; setup then updates it unasked. */
export function hasLegacyStatusline(): boolean {
  try {
    return JSON.parse(fs.readFileSync(path.join(claudeHome(), 'settings.json'), 'utf8')).statusLine?.command === LEGACY_STATUSLINE;
  } catch {
    return false;
  }
}

/**
 * Add sessionscope's statusLine to ~/.claude/settings.json. Returns false (and writes nothing) when the file exists but
 * is not a JSON object: we would otherwise replace the user's settings with just the statusLine.
 */
export function installStatusline(): boolean {
  const file = path.join(claudeHome(), 'settings.json');
  let json: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      parsed = undefined;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.log(`✘ ${file} is not valid JSON (or not an object), so sessionscope left it untouched. Fix it, or add the statusLine yourself (see above).`);
      return false;
    }
    json = parsed as Record<string, unknown>;
  }
  const current = json.statusLine as { command?: unknown } | undefined;
  if (current && current.command !== LEGACY_STATUSLINE) {
    console.log('ℹ a statusLine is already configured; left unchanged.');
    return true;
  }
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.sessionscope-backup`);
  json.statusLine = { type: 'command', command: 'sessionscope statusline' };
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`✔ statusLine added to ${file} (backup: ${file}.sessionscope-backup)`);
  return true;
}
